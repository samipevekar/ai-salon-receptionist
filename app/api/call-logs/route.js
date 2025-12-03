import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET all call logs with pagination, search, and filters
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const botId = searchParams.get('botId');
    const fromDate = searchParams.get('fromDate');
    const toDate = searchParams.get('toDate');
    const sortBy = searchParams.get('sortBy') || 'created_at';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const offset = (page - 1) * limit;

    let baseQuery = `
      SELECT 
        cl.*,
        b.name as bot_name,
        b.id as bot_id,
        COALESCE(
          (SELECT COUNT(*) FROM function_logs fl WHERE fl.call_id = cl.call_id),
          0
        ) as function_calls
      FROM call_logs cl
      LEFT JOIN bots b ON cl.bot_id = b.id
    `;

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // EXCLUDE PRE-CALL LOGS
    whereConditions.push(`
      NOT (
        cl.status = 'ongoing'
        AND cl.summary IS NULL
        AND cl.transcript IS NULL
      )
    `);

    if (search) {
      paramCount++;
      whereConditions.push(`
        (cl.customer_name ILIKE $${paramCount} OR 
         cl.customer_phone ILIKE $${paramCount} OR 
         cl.call_id ILIKE $${paramCount} OR
         cl.transcript ILIKE $${paramCount})
      `);
      queryParams.push(`%${search}%`);
    }

    if (status) {
      paramCount++;
      whereConditions.push(`cl.status = $${paramCount}`);
      queryParams.push(status);
    }

    if (botId) {
      paramCount++;
      whereConditions.push(`cl.bot_id = $${paramCount}`);
      queryParams.push(botId);
    }

    if (fromDate) {
      paramCount++;
      whereConditions.push(`DATE(cl.created_at) >= $${paramCount}`);
      queryParams.push(fromDate);
    }

    if (toDate) {
      paramCount++;
      whereConditions.push(`DATE(cl.created_at) <= $${paramCount}`);
      queryParams.push(toDate);
    }

    if (whereConditions.length > 0) {
      baseQuery += ' WHERE ' + whereConditions.join(' AND ');
    }

    const validSortColumns = ['created_at', 'duration', 'status', 'customer_name'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    baseQuery += ` ORDER BY cl.${sortColumn} ${order}`;

    let countQuery = 'SELECT COUNT(*) FROM call_logs cl';
    
    // apply SAME filter to count
    let countWhere = [...whereConditions].join(' AND ');
    countQuery += ` WHERE ${countWhere}`;

    const countResult = await query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    paramCount++;
    baseQuery += ` LIMIT $${paramCount}`;
    queryParams.push(limit);

    paramCount++;
    baseQuery += ` OFFSET $${paramCount}`;
    queryParams.push(offset);

    const result = await query(baseQuery, queryParams);

    const logs = result.rows.map(log => ({
      id: log.id,
      call_id: log.call_id,
      customer_name: log.customer_name,
      customer_phone: log.customer_phone,
      duration: log.duration,
      status: log.status,
      intent: log.intent,
      booking_decision: log.booking_decision,
      transcript: log.transcript,
      summary: log.summary,
      metadata: log.metadata,
      created_at: log.created_at,
      bot_name: log.bot_name,
      bot_id: log.bot_id,
      function_calls: log.function_calls
    }));

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching call logs:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch call logs',
        details: error.message 
      },
      { status: 500 }
    );
  }
}


// CREATE a new call log
export async function POST(request) {
  try {
    const body = await request.json();
    
    const {
      call_id,
      bot_id,
      customer_name,
      customer_phone,
      transcript,
      summary,
      intent,
      booking_decision,
      duration,
      status = 'ongoing',
      metadata = {}
    } = body;
    
    // Validate required fields
    if (!call_id) {
      return NextResponse.json(
        { error: 'call_id is required' },
        { status: 400 }
      );
    }
    
    // Check if call log already exists
    const existing = await query(
      'SELECT id FROM call_logs WHERE call_id = $1',
      [call_id]
    );
    
    let result;
    
    if (existing.rows.length > 0) {
      // Update existing call log
      result = await query(`
        UPDATE call_logs 
        SET 
          bot_id = COALESCE($1, bot_id),
          customer_name = COALESCE($2, customer_name),
          customer_phone = COALESCE($3, customer_phone),
          transcript = COALESCE($4, transcript),
          summary = COALESCE($5, summary),
          intent = COALESCE($6, intent),
          booking_decision = COALESCE($7, booking_decision),
          duration = COALESCE($8, duration),
          status = COALESCE($9, status),
          metadata = COALESCE($10::jsonb, metadata),
          created_at = COALESCE(created_at, NOW())
        WHERE call_id = $11
        RETURNING *
      `, [
        bot_id,
        customer_name,
        customer_phone,
        transcript,
        summary,
        intent,
        booking_decision,
        duration,
        status,
        JSON.stringify(metadata),
        call_id
      ]);
    } else {
      // Create new call log
      result = await query(`
        INSERT INTO call_logs (
          call_id,
          bot_id,
          customer_name,
          customer_phone,
          transcript,
          summary,
          intent,
          booking_decision,
          duration,
          status,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        call_id,
        bot_id,
        customer_name,
        customer_phone,
        transcript,
        summary,
        intent,
        booking_decision,
        duration,
        status,
        JSON.stringify(metadata)
      ]);
    }
    
    return NextResponse.json(result.rows[0], { status: 201 });
    
  } catch (error) {
    console.error('Error creating/updating call log:', error);
    return NextResponse.json(
      { 
        error: 'Failed to save call log',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// BULK operations or other methods can be added here
export async function PUT(request) {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;
    
    if (!id) {
      return NextResponse.json(
        { error: 'id is required for update' },
        { status: 400 }
      );
    }
    
    // Build dynamic update query
    const fields = [];
    const values = [];
    let paramCount = 0;
    
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        paramCount++;
        fields.push(`${key} = $${paramCount}`);
        
        // Handle JSON fields
        if (key === 'metadata') {
          values.push(JSON.stringify(updateData[key]));
        } else {
          values.push(updateData[key]);
        }
      }
    });
    
    if (fields.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }
    
    paramCount++;
    values.push(id);
    
    const result = await query(`
      UPDATE call_logs 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, values);
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Call log not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(result.rows[0]);
    
  } catch (error) {
    console.error('Error updating call log:', error);
    return NextResponse.json(
      { error: 'Failed to update call log' },
      { status: 500 }
    );
  }
}

// DELETE call log
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const callId = searchParams.get('callId');
    
    if (!id && !callId) {
      return NextResponse.json(
        { error: 'Either id or callId is required' },
        { status: 400 }
      );
    }
    
    const result = await query(
      'DELETE FROM call_logs WHERE id = $1 OR call_id = $2 RETURNING *',
      [id, callId]
    );
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Call log not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ 
      message: 'Call log deleted successfully',
      deleted: result.rows[0] 
    });
    
  } catch (error) {
    console.error('Error deleting call log:', error);
    return NextResponse.json(
      { error: 'Failed to delete call log' },
      { status: 500 }
    );
  }
}