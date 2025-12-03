import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function POST(request) {
  try {
    const callData = await request.json()
    
    console.log('Post-call webhook received:', JSON.stringify(callData, null, 2))
    
    // Extract call_id from different possible fields
    const call_id = callData.call_id || callData.sessionId || callData.callId
    
    if (!call_id) {
      console.log('No call_id found in post-call data')
      return NextResponse.json({ 
        status: 'error',
        message: 'call_id not provided' 
      }, { status: 400 })
    }

    // Extract other data with better parsing
    let transcript = ''
    if (callData.transcript) {
      if (Array.isArray(callData.transcript)) {
        // Transcript is array of messages
        transcript = callData.transcript.map(msg => 
          `${msg.role || 'Unknown'}: ${msg.content || ''}`
        ).join('\n')
      } else if (typeof callData.transcript === 'string') {
        transcript = callData.transcript
      } else {
        transcript = JSON.stringify(callData.transcript)
      }
    }
    
    const summary = callData.summary || callData.endOfCallSummary || ''
    const intent = callData.intent || callData.callIntent || callData.analysis?.intent || 'general inquiry'
    const booking_decision = callData.booking_decision || callData.actionTaken || callData.analysis?.action || 'No booking made'
    const duration = callData.duration || callData.callDuration || '0'
    
    // Extract customer info if available
    const customer_name = callData.customer_name || callData.customerInfo?.name
    const customer_phone = callData.customer_phone || callData.customerInfo?.phone
    
    // Extract metadata for booking details
    let bookingDetails = {}
    let serviceBooked = null
    let stylistBooked = null
    let appointmentTime = null
    
    // Try to extract booking information from transcript or summary
    if (summary.toLowerCase().includes('book') || booking_decision.toLowerCase().includes('book')) {
      // Simple regex patterns to extract booking info
      const serviceMatch = summary.match(/(haircut|hair spa|keratin|hair color|blow dry|manicure|pedicure)/i)
      const stylistMatch = summary.match(/(riya|aditi|priya|neha|anjali)/i)
      const timeMatch = summary.match(/(\d{1,2}:\d{2}\s*(am|pm)|tomorrow|today|next week)/i)
      
      if (serviceMatch) serviceBooked = serviceMatch[1]
      if (stylistMatch) stylistBooked = stylistMatch[1]
      if (timeMatch) appointmentTime = timeMatch[0]
      
      bookingDetails = {
        service: serviceBooked,
        stylist: stylistBooked,
        time: appointmentTime,
        extractedFrom: 'summary_analysis'
      }
    }
    
    // Check if we need to update customer information
    let customer_id = null
    if (customer_phone) {
      const customerResult = await query(
        'SELECT id FROM customers WHERE phone = $1',
        [customer_phone]
      )
      
      if (customerResult.rows.length > 0) {
        customer_id = customerResult.rows[0].id
      } else if (customer_name) {
        // Create new customer if not exists
        const newCustomer = await query(`
          INSERT INTO customers (name, phone, created_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (phone) DO NOTHING
          RETURNING id
        `, [customer_name, customer_phone])
        
        if (newCustomer.rows.length > 0) {
          customer_id = newCustomer.rows[0].id
          console.log('New customer created:', customer_name)
        }
      }
    }
    
    // Check if call log exists
    const checkResult = await query(
      'SELECT * FROM call_logs WHERE call_id = $1',
      [call_id]
    )
    
    // Prepare metadata
    const metadata = {
      ...callData,
      bookingDetails,
      processedAt: new Date().toISOString(),
      customerInfo: {
        name: customer_name,
        phone: customer_phone,
        id: customer_id
      }
    }
    
    // Remove sensitive information from metadata if present
    delete metadata.apiKey
    delete metadata.token
    delete metadata.password
    
    if (checkResult.rows.length > 0) {
      // Update existing call log
      const result = await query(`
        UPDATE call_logs 
        SET 
          transcript = $1,
          summary = $2,
          intent = $3,
          booking_decision = $4,
          duration = $5,
          status = 'completed',
          metadata = $6,
          customer_id = COALESCE($7, customer_id),
          customer_name = COALESCE($8, customer_name),
          customer_phone = COALESCE($9, customer_phone),
          updated_at = NOW()
        WHERE call_id = $10
        RETURNING *
      `, [
        transcript,
        summary,
        intent,
        booking_decision,
        parseInt(duration) || 0,
        JSON.stringify(metadata),
        customer_id,
        customer_name,
        customer_phone,
        call_id
      ])
      
      console.log('Call log updated:', result.rows[0].id)
    } else {
      // Create new call log
      const result = await query(`
        INSERT INTO call_logs (
          call_id,
          transcript,
          summary,
          intent,
          booking_decision,
          duration,
          status,
          metadata,
          customer_id,
          customer_name,
          customer_phone
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        call_id,
        transcript,
        summary,
        intent,
        booking_decision,
        parseInt(duration) || 0,
        'completed',
        JSON.stringify(metadata),
        customer_id,
        customer_name,
        customer_phone
      ])
      
      console.log('Call log created:', result.rows[0].id)
    }
    
    // If booking was made, create appointment record
    if (serviceBooked && customer_id) {
      try {
        const appointmentId = `SAL-${Date.now().toString().slice(-6)}`
        
        await query(`
          INSERT INTO appointments (
            appointment_id,
            customer_id,
            service,
            stylist,
            appointment_time,
            status,
            source
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          appointmentId,
          customer_id,
          serviceBooked,
          stylistBooked || 'To be assigned',
          appointmentTime ? new Date(appointmentTime) : new Date(Date.now() + 24 * 60 * 60 * 1000), // Default: tomorrow
          'pending',
          'ai_call'
        ])
        
        console.log('Appointment created:', appointmentId)
      } catch (apptError) {
        console.error('Error creating appointment:', apptError.message)
      }
    }
    
    // Send response
    const responseData = { 
      status: 'success',
      message: 'Call data stored successfully',
      call_id,
      customer_updated: !!customer_id,
      appointment_created: !!serviceBooked
    }
    
    return NextResponse.json(responseData)
    
  } catch (error) {
    console.error('Post-call webhook error:', error)
    
    // Try to log error to database
    try {
      await query(`
        INSERT INTO call_logs (
          call_id,
          status,
          metadata,
          summary
        ) VALUES ($1, $2, $3, $4)
      `, [
        'error_' + Date.now(),
        'failed',
        JSON.stringify({ 
          error: error.message,
          timestamp: new Date().toISOString()
        }),
        'Error processing post-call webhook'
      ])
    } catch (dbError) {
      console.error('Failed to log error:', dbError)
    }
    
    return NextResponse.json(
      { 
        status: 'error',
        message: 'Internal server error',
        details: error.message 
      },
      { status: 500 }
    )
  }
}