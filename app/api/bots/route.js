import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET all bots
export async function GET() {
  try {
    const result = await query(`
      SELECT * FROM bots ORDER BY created_at DESC
    `);
    
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Get bots error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bots' },
      { status: 500 }
    );
  }
}

// CREATE new bot
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, description, prompt, webhook_url } = body;
    
    console.log('Creating bot with data:', body);
    
    if (!name || !prompt) {
      return NextResponse.json(
        { error: 'Name and prompt are required' },
        { status: 400 }
      );
    }
    
    // Build dynamic query based on available columns
    const tableInfo = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'bots'
      AND column_name IN ('name', 'description', 'prompt', 'webhook_url', 'domain', 'is_active')
    `);
    
    const columns = tableInfo.rows.map(r => r.column_name);
    
    let queryStr = 'INSERT INTO bots (';
    let values = [];
    let paramCount = 0;
    
    // Add columns that exist
    if (columns.includes('name')) {
      queryStr += 'name, ';
      values.push(name);
      paramCount++;
    }
    
    if (columns.includes('description')) {
      queryStr += 'description, ';
      values.push(description || '');
      paramCount++;
    }
    
    if (columns.includes('prompt')) {
      queryStr += 'prompt, ';
      values.push(prompt);
      paramCount++;
    }
    
    if (columns.includes('webhook_url') && webhook_url) {
      queryStr += 'webhook_url, ';
      values.push(webhook_url);
      paramCount++;
    }
    
    if (columns.includes('domain')) {
      queryStr += 'domain, ';
      values.push('salon-receptionist');
      paramCount++;
    }
    
    if (columns.includes('is_active')) {
      queryStr += 'is_active, ';
      values.push(true);
      paramCount++;
    }
    
    // Remove trailing comma and space
    queryStr = queryStr.slice(0, -2);
    
    // Add values placeholders
    queryStr += ') VALUES (';
    for (let i = 1; i <= paramCount; i++) {
      queryStr += `$${i}`;
      if (i < paramCount) queryStr += ', ';
    }
    queryStr += ') RETURNING *';
    
    console.log('Executing query:', queryStr);
    console.log('With values:', values);
    
    const result = await query(queryStr, values);
    
    return NextResponse.json(result.rows[0], { status: 201 });
    
  } catch (error) {
    console.error('Create bot error:', error);
    return NextResponse.json(
      { error: 'Failed to create bot', details: error.message },
      { status: 500 }
    );
  }
}
export async function PUT(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const body = await request.json();
    const { name, description = '', prompt, webhook_url = null } = body;

    if (!id) return NextResponse.json({ error: 'Bot ID required' }, { status: 400 });
    if (!name || !prompt) return NextResponse.json({ error: 'Name and prompt required' }, { status: 400 });

    const result = await query(
      `UPDATE bots
       SET name = $1, description = $2, prompt = $3, webhook_url = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [name, description, prompt, webhook_url, id]
    );

    if (result.rowCount === 0)
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });

    return NextResponse.json(result.rows[0]);

  } catch (error) {
    console.error('Update bot error:', error);
    return NextResponse.json({ error: 'Failed to update bot', details: error.message }, { status: 500 });
  }
}


// DELETE bot
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    console.log('Deleting bot:', id);
    
    if (!id) {
      return NextResponse.json(
        { error: 'Bot ID is required' },
        { status: 400 }
      );
    }
    
    const result = await query(
      'DELETE FROM bots WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Bot not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Bot deleted successfully',
      bot: result.rows[0]
    });
  } catch (error) {
    console.error('Delete bot error:', error);
    return NextResponse.json(
      { error: 'Failed to delete bot', details: error.message },
      { status: 500 }
    );
  }
}