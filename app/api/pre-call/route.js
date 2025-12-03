import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function POST(request) {
  try {
    const data = await request.json()
    
    console.log('Pre-call webhook received:', data)
    
    // Extract data from OpenMic
    const call_id = data.call_id || data.sessionId || data.callId || `precall_${Date.now()}`
    const caller_number = data.caller_number || data.fromPhoneNumber || data.phoneNumber

    
    console.log('Extracted data:', { call_id, caller_number })
    
    let customerData = {
      name: "Guest Customer",
      lastVisit: "First time caller",
      preferredStylist: "Available Stylist",
      pastServices: [],
      upcomingAppointments: [],
      customerId: null,
      preferences: {
        contactMethod: "call",
        language: "english"
      }
    }
    
    // If we have caller number, fetch real customer data
    if (caller_number) {
      const result = await query(`
        SELECT 
          c.*,
          (
            SELECT MAX(appointment_time) 
            FROM appointments a 
            WHERE a.customer_id = c.id 
            AND a.status IN ('completed', 'confirmed')
          ) as last_visit_date,
          (
            SELECT ARRAY_AGG(DISTINCT service)
            FROM appointments a 
            WHERE a.customer_id = c.id
            AND a.status = 'completed'
          ) as completed_services,
          (
            SELECT JSON_AGG(
              JSON_BUILD_OBJECT(
                'appointmentId', appointment_id,
                'service', service,
                'stylist', stylist,
                'time', appointment_time,
                'status', status
              )
            )
            FROM appointments a 
            WHERE a.customer_id = c.id
            AND a.status IN ('scheduled', 'confirmed')
            AND a.appointment_time > NOW()
            ORDER BY a.appointment_time
            LIMIT 3
          ) as upcoming_appointments
        FROM customers c
        WHERE c.phone = $1
        LIMIT 1
      `, [caller_number])
      
      if (result.rows.length > 0) {
        const customer = result.rows[0]
        
        // Format last visit date
        let lastVisit = "First time caller"
        if (customer.last_visit_date) {
          const lastVisitDate = new Date(customer.last_visit_date)
          lastVisit = lastVisitDate.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })
        }
        
        customerData = {
          name: customer.name,
          lastVisit: lastVisit,
          preferredStylist: customer.preferred_stylist || "Available Stylist",
          pastServices: customer.completed_services || [],
          upcomingAppointments: customer.upcoming_appointments || [],
          customerId: customer.id,
          phone: customer.phone,
          email: customer.email,
          preferences: {
            contactMethod: customer.notes?.includes('text') ? "text" : "call",
            language: "english",
            notes: customer.notes
          }
        }
        
        console.log('Found existing customer:', customerData.name)
      } else {
        console.log('New customer detected:', caller_number)
        
        // For new customers, check if phone pattern matches Indian numbers
        const isIndianNumber = caller_number.startsWith('+91') || 
                              caller_number.startsWith('91') || 
                              caller_number.replace(/\D/g, '').length === 10
        
        if (isIndianNumber) {
          customerData = {
            name: "New Customer",
            lastVisit: "First time caller",
            preferredStylist: "Available Stylist",
            pastServices: [],
            upcomingAppointments: [],
            customerId: null,
            phone: caller_number,
            preferences: {
              contactMethod: "call",
              language: "hindi",
              isNewCustomer: true
            }
          }
        }
      }
    }
    
    // Log the call initiation
    if (call_id) {
      try {
        // Get bot ID if available
        const botResult = await query(
          'SELECT id FROM bots WHERE is_active = true ORDER BY created_at DESC LIMIT 1'
        )
        
        const botId = botResult.rows[0]?.id
        
        // Get customer ID if exists
        let customerId = null
        if (caller_number) {
          const custResult = await query(
            'SELECT id FROM customers WHERE phone = $1',
            [caller_number]
          )
          customerId = custResult.rows[0]?.id
        }
        
        await query(`
          INSERT INTO call_logs (
            call_id,
            customer_id,
            bot_id,
            status,
            metadata
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (call_id) DO UPDATE SET
            status = EXCLUDED.status,
            metadata = EXCLUDED.metadata
        `, [
          call_id,
          customerId,
          botId,
          'ongoing',
          JSON.stringify({
            ...customerData,
            receivedAt: new Date().toISOString(),
            source: 'pre-call-webhook'
          })
        ])
        
        console.log('Call log created/updated:', call_id)
      } catch (dbError) {
        console.error('Database error in pre-call:', dbError.message)
        // Continue even if database fails
      }
    }
    
    // Return only essential data for OpenMic
    const responseForOpenMic = {
      name: customerData.name,
      lastVisit: customerData.lastVisit,
      preferredStylist: customerData.preferredStylist,
      pastServices: customerData.pastServices.slice(0, 3), // Limit to 3 services
      customerType: customerData.customerId ? "returning" : "new",
      languagePreference: customerData.preferences.language || "english"
    }
    
    return NextResponse.json(responseForOpenMic)
    
  } catch (error) {
    console.error('Pre-call webhook error:', error)
    
    // Fallback response that ensures call continues
    return NextResponse.json({
      name: "Customer",
      lastVisit: "Recent",
      preferredStylist: "Available Stylist",
      pastServices: ["General Service"],
      customerType: "guest",
      languagePreference: "english"
    }, { status: 200 })
  }
}