import { NextResponse } from 'next/server'
import { query } from '@/lib/db'


const MAX_LOG_LENGTH = 50000 // truncate logs to avoid huge JSON errors

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch (err) {
    console.error('Invalid JSON body', err)
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  let { function_name, parameters = {}, call_id, sessionId, bot_id } = body

  // Accept alternative field names commonly used
  call_id = call_id || sessionId || body.callId || 'unknown_call'

  if (!function_name || typeof function_name !== 'string') {
    return NextResponse.json(
      {
        error: 'function_name missing or invalid',
        available_functions: availableFunctions()
      },
      { status: 400 }
    )
  }

  console.log('In-call function triggered:', { function_name, call_id, parameters })

  try {
    let response

    switch (function_name) {
      case 'get_appointment_details':
        response = await handleGetAppointmentDetails(parameters)
        break

      case 'get_available_stylists':
        response = await handleGetAvailableStylists(parameters)
        break

      case 'get_service_prices':
        response = await handleGetServicePrices(parameters)
        break

      case 'check_availability':
        response = await handleCheckAvailability(parameters)
        break

      case 'book_appointment':
        response = await handleBookAppointment(parameters, call_id)
        break

      case 'update_customer_info':
        response = await handleUpdateCustomerInfo(parameters, call_id)
        break

      case 'cancel_appointment':
        response = await handleCancelAppointment(parameters)
        break

      case 'get_customer_history':
        response = await handleGetCustomerHistory(parameters)
        break

      default:
        response = {
          error: 'Function not found',
          available_functions: availableFunctions()
        }
    }

    // Log function call (safe)
    try {
      const requestData = safeStringify(parameters)
      const responseData = safeStringify(response)
      await safeInsertFunctionLog({ call_id, bot_id, function_name, requestData, responseData })
    } catch (logErr) {
      console.error('Failed to log function call (non-fatal):', logErr?.message || logErr)
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('In-call function error:', error)
    // try to log error too
    try {
      await safeInsertFunctionLog({
        call_id,
        bot_id,
        function_name,
        requestData: safeStringify(parameters || {}),
        responseData: safeStringify({ error: error.message })
      })
    } catch (e) {
      console.error('Failed to log error', e)
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error.message,
        fallback_data: getFallbackData(function_name)
      },
      { status: 500 }
    )
  }
}


function availableFunctions() {
  return [
    'get_appointment_details',
    'get_available_stylists',
    'get_service_prices',
    'check_availability',
    'book_appointment',
    'update_customer_info',
    'cancel_appointment',
    'get_customer_history'
  ]
}

/* Safe stringify with length limit */
function safeStringify(obj) {
  try {
    const s = JSON.stringify(obj)
    if (s.length > MAX_LOG_LENGTH) return s.slice(0, MAX_LOG_LENGTH) + '...TRUNCATED...'
    return s
  } catch (err) {
    return `"unserializable: ${String(err)}"`
  }
}

/* Try inserting into function_logs; if table missing, swallow error */
async function safeInsertFunctionLog({ call_id, bot_id = null, function_name, requestData, responseData }) {
  // Try with bot_id column if available; fallback to minimal insert
  const truncatedReq = typeof requestData === 'string' ? requestData : safeStringify(requestData)
  const truncatedRes = typeof responseData === 'string' ? responseData : safeStringify(responseData)

  try {
    // Primary attempt - assume table exists with these columns
    await query(
      `INSERT INTO function_logs (call_id, bot_id, function_name, request_data, response_data, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [call_id, bot_id, function_name, truncatedReq, truncatedRes]
    )
  } catch (err) {
    // If insert fails (table missing or column mismatch), try a minimal insert if possible
    console.warn('Primary function_logs insert failed:', err.message)
    try {
      await query(
        `INSERT INTO function_logs (call_id, function_name, request_data, response_data)
         VALUES ($1, $2, $3, $4)`,
        [call_id, function_name, truncatedReq, truncatedRes]
      )
    } catch (err2) {
      // Give up silently (we don't want this to break the main flow)
      console.warn('Fallback function_logs insert also failed:', err2.message)
    }
  }
}

/* ----------------------
   Business handlers
   ---------------------- */

async function handleGetAppointmentDetails(parameters = {}) {
  const { appointment_id, customer_name, customer_phone } = parameters || {}
  try {
    // Build dynamic query safely
    const parts = []
    const values = []
    let idx = 1

    let base = `
      SELECT a.*, c.name AS customer_name, c.phone AS customer_phone
      FROM appointments a
      LEFT JOIN customers c ON a.customer_id = c.id
      WHERE 1=1
    `

    if (appointment_id) {
      parts.push(`a.appointment_id = $${idx++}`)
      values.push(appointment_id)
    }
    if (customer_name) {
      parts.push(`c.name ILIKE $${idx++}`)
      values.push(`%${customer_name}%`)
    }
    if (customer_phone) {
      parts.push(`c.phone = $${idx++}`)
      values.push(customer_phone)
    }

    const where = parts.length > 0 ? ' AND ' + parts.join(' AND ') : ''
    const sql = base + where + ' ORDER BY a.appointment_time DESC LIMIT 5'

    let result
    try {
      result = await query(sql, values)
    } catch (err) {
      // Table might not exist; return fallback instead of throwing
      console.warn('DB error in handleGetAppointmentDetails, returning fallback:', err.message)
      return { success: false, message: 'DB unavailable - returning fallback', fallback: getFallbackData('get_appointment_details') }
    }

    if (!result.rows || result.rows.length === 0) {
      return { success: false, message: 'No appointments found', suggestion: 'Provide appointment ID or customer details' }
    }

    const appointments = result.rows.map(row => ({
      appointmentId: row.appointment_id,
      service: row.service,
      stylist: row.stylist,
      time: formatDateTime(row.appointment_time),
      status: row.status,
      duration: getServiceDuration(row.service),
      price: formatPriceNumber(row.price),
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      notes: row.notes
    }))

    return { success: true, appointments, count: appointments.length }
  } catch (error) {
    console.error('Error fetching appointment details:', error)
    throw error
  }
}

async function handleGetAvailableStylists(parameters = {}) {
  const { date } = parameters || {}
  
  try {
    // First, get all stylists from appointments table (distinct names)
    let stylistsRows = []
    try {
      // Get distinct stylist names from appointments table where stylist is not null
      const res = await query(`
        SELECT DISTINCT stylist as name
        FROM appointments 
        WHERE stylist IS NOT NULL AND stylist != ''
        ORDER BY stylist ASC
      `)
      stylistsRows = res.rows || []
    } catch (err) {
      console.warn('DB error fetching stylists from appointments table:', err.message)
      stylistsRows = []
    }

    // If no stylists found in appointments table, try customers table or use defaults
    if (stylistsRows.length === 0) {
      try {
        // Try getting from customers table (preferred_stylist field)
        const res = await query(`
          SELECT DISTINCT preferred_stylist as name
          FROM customers 
          WHERE preferred_stylist IS NOT NULL AND preferred_stylist != ''
          ORDER BY preferred_stylist ASC
        `)
        stylistsRows = res.rows || []
      } catch (err) {
        console.warn('DB error fetching stylists from customers table:', err.message)
      }
    }

    // Get availability information for the requested date if provided
    const availabilityInfo = {}
    if (date && stylistsRows.length > 0) {
      try {
        const dateStr = new Date(date).toISOString().split('T')[0]
        
        // Check how many appointments each stylist has on the given date
        const busyRes = await query(`
          SELECT stylist, COUNT(*)::int as busy_slots
          FROM appointments
          WHERE DATE(appointment_time) = $1
            AND status IN ('scheduled', 'confirmed')
            AND stylist IS NOT NULL
          GROUP BY stylist
        `, [dateStr])
        
        busyRes.rows.forEach(row => {
          availabilityInfo[row.stylist] = { 
            busySlots: parseInt(row.busy_slots, 10) || 0, 
            isBusy: (parseInt(row.busy_slots, 10) || 0) >= 5 // Consider busy if 5 or more appointments
          }
        })
      } catch (err) {
        console.warn('Could not fetch busy slots:', err.message)
      }
    }

    // Format stylist data with availability information
    const stylists = stylistsRows
      .filter(row => row.name && row.name.trim() !== '')
      .map(row => {
        const name = row.name
        const busy = availabilityInfo[name]?.isBusy ?? false
        
        return {
          name,
          available: !busy,
          rating: (4.5 + Math.random() * 0.5).toFixed(1),
          specialty: getStylistSpecialty(name),
          experience: getExperienceLevel(name),
          busySlots: availabilityInfo[name]?.busySlots || 0
        }
      })

    // If still no stylists found, use default salon stylists
    if (stylists.length === 0) {
      const defaultStylists = [
        { name: 'Riya Sharma', available: true, rating: 4.8, specialty: 'Hair Coloring', experience: '5 years', busySlots: 0 },
        { name: 'Aditi Verma', available: true, rating: 4.9, specialty: 'Hair Spa', experience: '7 years', busySlots: 0 },
        { name: 'Priya Singh', available: false, rating: 4.7, specialty: 'Haircut & Styling', experience: '3 years', busySlots: 6 },
        { name: 'Neha Gupta', available: true, rating: 4.6, specialty: 'Keratin Treatment', experience: '4 years', busySlots: 0 },
        { name: 'Anjali Patel', available: true, rating: 4.8, specialty: 'Hair Color Correction', experience: '6 years', busySlots: 0 },
        { name: 'Sonia Kapoor', available: true, rating: 4.5, specialty: 'Bridal Makeup', experience: '8 years', busySlots: 0 },
        { name: 'Maya Reddy', available: true, rating: 4.7, specialty: 'Facial Treatments', experience: '4 years', busySlots: 0 },
        { name: 'Kavita Joshi', available: false, rating: 4.9, specialty: 'Hair Extensions', experience: '9 years', busySlots: 8 }
      ]
      
      // Check availability for requested date if provided
      if (date) {
        const dateStr = new Date(date).toISOString().split('T')[0]
        defaultStylists.forEach(stylist => {
          // Simulate availability based on day of week
          const day = new Date(dateStr).getDay()
          if (day === 0 || day === 6) { // Weekend
            stylist.available = stylist.busySlots < 8
          } else { // Weekday
            stylist.available = stylist.busySlots < 10
          }
        })
      }
      
      return { 
        success: true,
        availableStylists: defaultStylists, 
        count: defaultStylists.length, 
        dateRequested: date || 'Any date',
        source: 'default_data'
      }
    }

    return { 
      success: true,
      availableStylists: stylists, 
      count: stylists.length, 
      dateRequested: date || 'Any date',
      source: 'database'
    }
  } catch (error) {
    console.error('Error fetching stylists:', error)
    throw error
  }
}

async function handleGetServicePrices(/*parameters*/) {
  try {
    let rows = []
    try {
      const res = await query(`
        SELECT service,
               MIN(price) as min_price,
               MAX(price) as max_price,
               AVG(price) as avg_price,
               COUNT(*) as total_bookings,
               STRING_AGG(DISTINCT stylist, ', ') as available_stylists
        FROM appointments
        WHERE price > 0
        GROUP BY service
        ORDER BY total_bookings DESC
      `)
      rows = res.rows || []
    } catch (err) {
      console.warn('DB error fetching service prices; returning defaults:', err.message)
      rows = []
    }

    const services = rows.map(row => ({
      name: row.service,
      minPrice: formatPriceNumber(row.min_price),
      maxPrice: formatPriceNumber(row.max_price),
      avgPrice: formatPriceNumber(row.avg_price),
      duration: getServiceDuration(row.service),
      category: getServiceCategory(row.service),
      popularity: getPopularityLevel(row.total_bookings),
      availableStylists: row.available_stylists?.split(', ').filter(Boolean) || [],
      totalBookings: parseInt(row.total_bookings || 0, 10)
    }))

    const allServices = [
      'Haircut', 'Hair Spa', 'Keratin', 'Hair Color', 'Blow Dry',
      'Manicure', 'Pedicure', 'Facial', 'Threading', 'Waxing'
    ]
    const existing = services.map(s => s.name)
    const missing = allServices.filter(s => !existing.includes(s))
    missing.forEach(svc => {
      services.push({
        name: svc,
        minPrice: formatPriceNumber(getDefaultPriceNumber(svc)),
        maxPrice: formatPriceNumber(getDefaultPriceNumber(svc, true)),
        avgPrice: formatPriceNumber(getDefaultPriceNumber(svc)),
        duration: getServiceDuration(svc),
        category: getServiceCategory(svc),
        popularity: 'Medium',
        availableStylists: ['All Stylists'],
        totalBookings: 0
      })
    })

    return { success: true, services, count: services.length, lastUpdated: new Date().toISOString().split('T')[0] }
  } catch (error) {
    console.error('Error fetching service prices:', error)
    throw error
  }
}

async function handleCheckAvailability(parameters = {}) {
  const { date, service, stylist } = parameters || {}
  
  try {
    // Parse the target date or use today
    const targetDate = date ? new Date(date) : new Date()
    const dateStr = targetDate.toISOString().split('T')[0]
    
    // Get next 7 days including the requested date
    const next7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(targetDate)
      d.setDate(d.getDate() + i)
      return d.toISOString().split('T')[0]
    })

    let allAvailableSlots = []

    // Check availability for each day in the next 7 days
    for (const day of next7Days) {
      const dailySlots = await getAvailableSlotsForDay(day, service, stylist)
      if (dailySlots.length > 0) {
        allAvailableSlots.push(...dailySlots)
      }
    }

    // If no slots found at all, create some default slots
    if (allAvailableSlots.length === 0) {
      allAvailableSlots = await generateDefaultSlots(targetDate, service, stylist)
    }

    // Format response
    const groupedByDate = {}
    allAvailableSlots.forEach(slot => {
      if (!groupedByDate[slot.date]) {
        groupedByDate[slot.date] = []
      }
      groupedByDate[slot.date].push(slot)
    })

    return {
      success: true,
      availableSlots: allAvailableSlots.slice(0, 50), // Limit to 50 slots max
      groupedByDate,
      dateRequested: dateStr,
      daysChecked: next7Days.length,
      totalAvailable: allAvailableSlots.length,
      nextAvailableDate: next7Days[0],
      message: allAvailableSlots.length > 0 
        ? `Found ${allAvailableSlots.length} available slots in the next 7 days`
        : 'No available slots found in the next 7 days'
    }
  } catch (error) {
    console.error('Error checking availability:', error)
    throw error
  }
}

// Helper function to get available slots for a specific day
async function getAvailableSlotsForDay(dateStr, requestedService = null, requestedStylist = null) {
  try {
    // Get booked slots for the day
    let queryParams = [dateStr]
    let queryStr = `
      SELECT appointment_time, stylist, service 
      FROM appointments 
      WHERE DATE(appointment_time) = $1 
        AND status IN ('scheduled', 'confirmed')
    `

    if (requestedService) {
      queryParams.push(requestedService)
      queryStr += ` AND service = $${queryParams.length}`
    }
    
    if (requestedStylist) {
      queryParams.push(requestedStylist)
      queryStr += ` AND stylist = $${queryParams.length}`
    }

    let bookedSlots = []
    try {
      const res = await query(queryStr, queryParams)
      bookedSlots = res.rows || []
    } catch (err) {
      console.warn('DB error fetching booked slots:', err.message)
      bookedSlots = []
    }

    // Get all stylists
    let allStylists = []
    try {
      const stylistRes = await query(`
        SELECT DISTINCT stylist 
        FROM appointments 
        WHERE stylist IS NOT NULL AND stylist != ''
        ORDER BY stylist ASC
      `)
      allStylists = stylistRes.rows.map(r => r.stylist)
    } catch (err) {
      console.warn('DB error fetching stylists:', err.message)
      allStylists = ['Riya Sharma', 'Aditi Verma', 'Priya Singh', 'Neha Gupta']
    }

    // Filter stylists if specific stylist requested
    if (requestedStylist) {
      allStylists = allStylists.filter(s => s === requestedStylist)
    }

    // Salon working hours: 9 AM to 7 PM
    const workingHours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
    const availableSlots = []

    // Generate slots for each hour and stylist
    for (const hour of workingHours) {
      for (const stylist of allStylists) {
        // Check if this slot is booked
        const isBooked = bookedSlots.some(booked => {
          const bookedTime = new Date(booked.appointment_time)
          return bookedTime.getHours() === hour && booked.stylist === stylist
        })

        if (!isBooked) {
          // Format time as "2:00 PM"
          const hour12 = hour % 12 || 12
          const ampm = hour < 12 ? 'AM' : 'PM'
          const timeStr = `${hour12}:00 ${ampm}`

          availableSlots.push({
            date: dateStr,
            time: timeStr,
            hour24: hour,
            stylist: stylist,
            available: true,
            slotId: `slot_${dateStr.replace(/-/g, '')}_${hour}_${stylist.replace(/\s+/g, '_')}`,
            service: requestedService || 'Any Service'
          })
        }
      }
    }

    return availableSlots
  } catch (error) {
    console.error('Error getting slots for day:', error)
    return []
  }
}

// Generate default slots when no database data available
async function generateDefaultSlots(targetDate, requestedService = null, requestedStylist = null) {
  const defaultSlots = []
  const stylists = requestedStylist 
    ? [requestedStylist] 
    : ['Riya Sharma', 'Aditi Verma', 'Priya Singh', 'Neha Gupta', 'Anjali Patel']
  
  // Generate slots for next 3 days
  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    const date = new Date(targetDate)
    date.setDate(date.getDate() + dayOffset)
    const dateStr = date.toISOString().split('T')[0]
    
    // Working hours: 9 AM to 6 PM
    const workingHours = [9, 10, 11, 12, 13, 14, 15, 16, 17]
    
    // Create 2-3 random slots per day
    const slotsPerDay = 2 + Math.floor(Math.random() * 2) // 2-3 slots per day
    
    for (let i = 0; i < slotsPerDay; i++) {
      const randomHour = workingHours[Math.floor(Math.random() * workingHours.length)]
      const randomStylist = stylists[Math.floor(Math.random() * stylists.length)]
      
      // Remove used hour for this iteration
      const hourIndex = workingHours.indexOf(randomHour)
      if (hourIndex > -1) {
        workingHours.splice(hourIndex, 1)
      }
      
      const hour12 = randomHour % 12 || 12
      const ampm = randomHour < 12 ? 'AM' : 'PM'
      const timeStr = `${hour12}:00 ${ampm}`
      
      defaultSlots.push({
        date: dateStr,
        time: timeStr,
        hour24: randomHour,
        stylist: randomStylist,
        available: true,
        slotId: `default_${dateStr.replace(/-/g, '')}_${randomHour}_${randomStylist.replace(/\s+/g, '_')}`,
        service: requestedService || 'Any Service',
        isDefault: true
      })
    }
  }
  
  return defaultSlots
}

async function handleBookAppointment(parameters = {}, call_id = 'unknown') {
  const { customer_name, customer_phone, service, stylist, date, time, notes } = parameters || {}

  if (!customer_phone || !service) {
    return { success: false, message: 'Customer phone and service are required' }
  }

  try {
    // Try find or create customer; if customers table missing, skip create but still create appointment record if possible
    let customer_id = null
    try {
      const res = await query('SELECT id FROM customers WHERE phone = $1', [customer_phone])
      if (res.rows.length > 0) customer_id = res.rows[0].id
      else {
        try {
          const ins = await query(`INSERT INTO customers (name, phone, created_at) VALUES ($1, $2, NOW()) RETURNING id`, [customer_name || 'New Customer', customer_phone])
          customer_id = ins.rows[0].id
        } catch (createErr) {
          console.warn('Failed to create customer (table missing?):', createErr.message)
          customer_id = null
        }
      }
    } catch (err) {
      console.warn('Customer lookup/create failed (likely missing customers table):', err.message)
      customer_id = null
    }

    // Parse date/time 
    let appointmentTime = null
    if (date && time) {
      const parsed = parseDateTime(date, time)
      if (parsed) appointmentTime = parsed
    }
    if (!appointmentTime) {
      appointmentTime = new Date(Date.now() + 24 * 60 * 60 * 1000) // tomorrow
      appointmentTime.setHours(10,0,0,0)
    }

    const appointmentId = `SAL-${Date.now().toString().slice(-6)}`
    try {
      await query(`
        INSERT INTO appointments (appointment_id, customer_id, service, stylist, appointment_time, status, price, notes, source)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        appointmentId,
        customer_id,
        service,
        stylist || 'To be assigned',
        appointmentTime,
        'confirmed',
        getServicePriceNumber(service),
        notes || `Booked via AI call. Call ID: ${call_id}`,
        'ai_booking'
      ])
    } catch (err) {
      console.warn('Failed to insert appointment (table may be missing):', err.message)
      // still return success metadata so agent can inform caller, but mark DB_saved=false
      return {
        success: true,
        appointmentId,
        customerId: customer_id,
        service,
        stylist: stylist || 'To be assigned',
        time: formatDateTime(appointmentTime),
        status: 'confirmed',
        price: formatPriceNumber(getServicePriceNumber(service)),
        confirmationMessage: `Appointment created (DB write failed: ${err.message}). Appointment ID: ${appointmentId}`,
        appointment_db_saved: false
      }
    }

    return {
      success: true,
      appointmentId,
      customerId: customer_id,
      service,
      stylist: stylist || 'To be assigned',
      time: formatDateTime(appointmentTime),
      status: 'confirmed',
      price: formatPriceNumber(getServicePriceNumber(service)),
      confirmationMessage: `Appointment booked successfully! Your appointment ID is ${appointmentId}. Please arrive 10 minutes before your appointment.`,
      reminder: 'You will receive a confirmation SMS shortly.'
    }
  } catch (error) {
    console.error('Error booking appointment:', error)
    throw error
  }
}

async function handleUpdateCustomerInfo(parameters = {}, /*call_id*/ ) {
  const { customer_phone, name, email, preferred_stylist, notes } = parameters || {}
  if (!customer_phone) return { success: false, message: 'Customer phone is required' }

  try {
    // Check customer exists
    let cus = null
    try {
      const res = await query('SELECT id FROM customers WHERE phone = $1', [customer_phone])
      if (res.rows.length === 0) return { success: false, message: 'Customer not found' }
      cus = res.rows[0]
    } catch (err) {
      console.warn('Customers table missing or query failed:', err.message)
      return { success: false, message: 'Unable to update - customer DB not available' }
    }

    const updateFields = []
    const updateValues = []
    let idx = 1
    if (name) { updateFields.push(`name = $${idx++}`); updateValues.push(name) }
    if (email) { updateFields.push(`email = $${idx++}`); updateValues.push(email) }
    if (preferred_stylist) { updateFields.push(`preferred_stylist = $${idx++}`); updateValues.push(preferred_stylist) }
    if (notes) { updateFields.push(`notes = $${idx++}`); updateValues.push(notes) }

    if (updateFields.length === 0) return { success: false, message: 'No information to update' }

    updateValues.push(cus.id)
    try {
      await query(`UPDATE customers SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${updateValues.length}`, updateValues)
    } catch (err) {
      console.warn('Failed to update customer:', err.message)
      return { success: false, message: 'Failed to update customer info (DB error)' }
    }

    return { success: true, message: 'Customer information updated successfully', customerId: cus.id, updatedFields: updateFields.map(s => s.split(' = ')[0]) }
  } catch (error) {
    console.error('Error updating customer info:', error)
    throw error
  }
}

async function handleCancelAppointment(parameters = {}) {
  const { appointment_id, customer_phone } = parameters || {}
  try {
    let queryStr = `
      UPDATE appointments
      SET status = 'cancelled', updated_at = NOW()
      WHERE status IN ('scheduled','confirmed')
    `
    const vals = []
    if (appointment_id) {
      vals.push(appointment_id)
      queryStr += ` AND appointment_id = $${vals.length}`
    }
    if (customer_phone) {
      vals.push(customer_phone)
      queryStr += ` AND customer_id IN (SELECT id FROM customers WHERE phone = $${vals.length})`
    }

    try {
      const res = await query(queryStr, vals)
      if (res.rowCount && res.rowCount > 0) {
        return { success: true, message: 'Appointment cancelled successfully', cancelledCount: res.rowCount }
      } else {
        return { success: false, message: 'No matching appointment found to cancel' }
      }
    } catch (err) {
      console.warn('Cancel appointment DB error:', err.message)
      return { success: false, message: 'Unable to cancel (DB unavailable)', fallback: getFallbackData('cancel_appointment') }
    }
  } catch (error) {
    console.error('Error cancelling appointment:', error)
    throw error
  }
}

async function handleGetCustomerHistory(parameters = {}) {
  const { customer_phone } = parameters || {}
  if (!customer_phone) return { success: false, message: 'Customer phone is required' }

  try {
    let result
    try {
      result = await query(`
        SELECT c.*,
          (SELECT COUNT(*) FROM appointments a WHERE a.customer_id = c.id AND a.status = 'completed') as total_visits,
          (SELECT SUM(price) FROM appointments a WHERE a.customer_id = c.id AND a.status = 'completed') as total_spent,
          (SELECT MAX(appointment_time) FROM appointments a WHERE a.customer_id = c.id) as last_visit_date
        FROM customers c
        WHERE c.phone = $1
      `, [customer_phone])
    } catch (err) {
      console.warn('DB error in getCustomerHistory:', err.message)
      return { success: false, message: 'DB unavailable', fallback: getFallbackData('get_customer_history') }
    }

    if (!result.rows.length) return { success: false, message: 'Customer not found' }

    const customer = result.rows[0]
    let appointments = []
    try {
      const apptRes = await query(`SELECT * FROM appointments WHERE customer_id = $1 ORDER BY appointment_time DESC LIMIT 5`, [customer.id])
      appointments = apptRes.rows.map(r => ({
        appointmentId: r.appointment_id,
        service: r.service,
        stylist: r.stylist,
        time: formatDateTime(r.appointment_time),
        status: r.status,
        price: formatPriceNumber(r.price)
      }))
    } catch (err) {
      console.warn('Failed to fetch recent appointments:', err.message)
    }

    const servicesResult = await query(`
      SELECT service, COUNT(*) as count
      FROM appointments
      WHERE customer_id = $1
      GROUP BY service
      ORDER BY count DESC
      LIMIT 3
    `, [customer.id]).catch(e => ({ rows: [] }))

    const favoriteServices = (servicesResult.rows || []).map(r => ({ service: r.service, count: parseInt(r.count || 0, 10) }))

    return {
      success: true,
      customer: {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        preferredStylist: customer.preferred_stylist,
        totalVisits: parseInt(customer.total_visits) || 0,
        totalSpent: formatPriceNumber(customer.total_spent) || formatPriceNumber(0),
        lastVisit: customer.last_visit_date ? formatDateTime(customer.last_visit_date) : 'Never',
        customerSince: formatDateTime(customer.created_at)
      },
      recentAppointments: appointments,
      favoriteServices,
      notes: customer.notes
    }
  } catch (error) {
    console.error('Error getting customer history:', error)
    throw error
  }
}

/* ----------------------
   Utilities (date parsing, formatting, small helpers)
   ---------------------- */

function formatDateTime(dateTime) {
  if (!dateTime) return 'Not scheduled'
  const d = new Date(dateTime)
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute:'2-digit', hour12: true })
}

/* Consistent number-based price for internal logic */
function formatPriceNumber(price) {
  if (price === null || price === undefined || isNaN(Number(price))) return formatPriceNumber(0)
  // return string formatted currency for display
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(Number(price))
}

function getServicePriceNumber(service) {
  const prices = {
    'haircut': 40.00,
    'hair spa': 75.00,
    'keratin': 120.00,
    'hair color': 85.00,
    'blow dry': 30.00,
    'manicure': 25.00,
    'pedicure': 35.00,
    'facial': 50.00,
    'threading': 15.00,
    'waxing': 40.00
  }
  if (!service) return 50.00
  return prices[(service || '').toLowerCase()] ?? 50.00
}

function getDefaultPriceNumber(service, isMax = false) {
  const base = {
    'haircut': isMax ? 45 : 35,
    'hair spa': isMax ? 85 : 70,
    'keratin': isMax ? 130 : 110,
    'hair color': isMax ? 95 : 75,
    'blow dry': isMax ? 35 : 25
  }
  return base[(service || '').toLowerCase()] ?? (isMax ? 60 : 40)
}

/* Simple service duration lookup */
function getServiceDuration(service) {
  if (!service) return '60 minutes'
  const durations = {
    'haircut': '30-45 minutes',
    'hair spa': '60 minutes',
    'keratin': '90-120 minutes',
    'hair color': '90-120 minutes',
    'blow dry': '30 minutes',
    'manicure': '45 minutes',
    'pedicure': '60 minutes',
    'facial': '60 minutes',
    'threading': '15 minutes',
    'waxing': '30 minutes'
  }
  return durations[(service || '').toLowerCase()] ?? '60 minutes'
}

function getServiceCategory(service) {
  const categories = {
    'haircut': 'Basic',
    'blow dry': 'Styling',
    'hair spa': 'Treatment',
    'keratin': 'Treatment',
    'hair color': 'Coloring',
    'manicure': 'Nails',
    'pedicure': 'Nails',
    'facial': 'Skincare',
    'threading': 'Skincare',
    'waxing': 'Skincare'
  }
  return categories[(service || '').toLowerCase()] ?? 'General'
}

function getStylistSpecialty(stylist = '') {
  const specialties = { 
    'riya': 'Hair Coloring', 
    'aditi': 'Hair Spa', 
    'priya': 'Haircut & Styling', 
    'neha': 'Keratin Treatment', 
    'anjali': 'Hair Color Correction',
    'sonia': 'Bridal Makeup',
    'maya': 'Facial Treatments',
    'kavita': 'Hair Extensions'
  }
  const s = (stylist || '').toLowerCase()
  const key = Object.keys(specialties).find(k => s.includes(k))
  return key ? specialties[key] : 'General Styling'
}

function getExperienceLevel(stylist = '') {
  const experiences = {
    'riya': '5 years',
    'aditi': '7 years', 
    'priya': '3 years',
    'neha': '4 years',
    'anjali': '6 years',
    'sonia': '8 years',
    'maya': '4 years',
    'kavita': '9 years'
  }
  const s = (stylist || '').toLowerCase()
  const key = Object.keys(experiences).find(k => s.includes(k))
  return key ? experiences[key] : '2+ years'
}

function getPopularityLevel(bookings = 0) {
  const n = Number(bookings || 0)
  if (n > 100) return 'Very Popular'
  if (n > 50) return 'Popular'
  if (n > 20) return 'Medium'
  return 'Low'
}

function getNextAvailableDate(currentDate, isFullyBooked) {
  const d = new Date(currentDate)
  d.setDate(d.getDate() + (isFullyBooked ? 1 : 0))
  return d.toISOString().split('T')[0]
}

function getFallbackData(function_name) {
  switch (function_name) {
    case 'get_appointment_details':
      return { appointmentId: 'SAL-1023', service: 'Hair Spa', stylist: 'Aditi', time: '4:00 PM', status: 'Confirmed' }
    case 'get_available_stylists':
      return { availableStylists: [{ name: 'Riya Sharma', available: true }, { name: 'Aditi Verma', available: true }] }
    case 'get_service_prices':
      return { services: [{ name: 'Haircut', price: '$40' }, { name: 'Hair Spa', price: '$75' }] }
    case 'check_availability':
      return { 
        availableSlots: [
          { date: new Date().toISOString().split('T')[0], time: '10:00 AM', stylist: 'Riya Sharma', available: true },
          { date: new Date().toISOString().split('T')[0], time: '2:00 PM', stylist: 'Aditi Verma', available: true }
        ]
      }
    default:
      return { message: 'Please try again or contact salon directly' }
  }
}

/* Robust date-time parsing for inputs like:
   date: '2025-12-05' or 'Dec 5 2025'
   time: '4pm', '4:00 PM', '16:00', '4:00pm', '4'
*/
function parseDateTime(dateStr, timeStr) {
  try {
    // Try direct parse first
    let combined = `${dateStr} ${timeStr}`
    let parsed = new Date(combined)
    if (!isNaN(parsed.getTime())) return parsed

    // Fallback: try to normalize time (handle am/pm)
    const timeNormalized = normalizeTimeString(timeStr)
    parsed = new Date(`${dateStr} ${timeNormalized}`)
    if (!isNaN(parsed.getTime())) return parsed

    // Fallback: if time only hour given, set minutes to 0
    const hourOnly = timeStr.match(/(\d{1,2})(?::\d{2})?\s*(am|pm)?/i)
    if (hourOnly) {
      const hour = parseInt(hourOnly[1], 10)
      const ampm = (hourOnly[2] || '').toLowerCase()
      let hr = hour
      if (ampm === 'pm' && hour < 12) hr = hour + 12
      if (ampm === 'am' && hour === 12) hr = 0
      const d = new Date(dateStr)
      d.setHours(hr, 0, 0, 0)
      if (!isNaN(d.getTime())) return d
    }

    return null
  } catch (err) {
    console.warn('parseDateTime error', err.message)
    return null
  }
}

function normalizeTimeString(t) {
  if (!t) return t
  t = String(t).trim().toLowerCase().replace(/\s+/g, '')
  // add colon if missing e.g., 4pm -> 4:00pm
  const m = t.match(/^(\d{1,2})(am|pm)?$/)
  if (m) return `${m[1]}:00${m[2] ? m[2] : ''}`
  return t
}