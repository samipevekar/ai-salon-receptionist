import { query } from './db'

// Customer-related functions
export const salonDB = {
  // Find customer by phone
  async findCustomerByPhone(phone) {
    try {
      const result = await query(`
        SELECT c.*, 
               (
                 SELECT MAX(appointment_time) 
                 FROM appointments 
                 WHERE customer_id = c.id 
                 AND status IN ('completed', 'confirmed')
               ) as last_visit
        FROM customers c
        WHERE c.phone = $1
      `, [phone])
      
      return result.rows[0]
    } catch (error) {
      console.error('Error finding customer:', error)
      return null
    }
  },
  
  // Get customer appointments
  async getCustomerAppointments(customerId, limit = 5) {
    try {
      const result = await query(`
        SELECT 
          appointment_id,
          service,
          stylist,
          appointment_time,
          status,
          price
        FROM appointments
        WHERE customer_id = $1
        ORDER BY appointment_time DESC
        LIMIT $2
      `, [customerId, limit])
      
      return result.rows
    } catch (error) {
      console.error('Error getting appointments:', error)
      return []
    }
  },
  
  // Get upcoming appointments
  async getUpcomingAppointments(customerId) {
    try {
      const result = await query(`
        SELECT 
          appointment_id,
          service,
          stylist,
          appointment_time,
          status
        FROM appointments
        WHERE customer_id = $1
        AND appointment_time > NOW()
        AND status IN ('scheduled', 'confirmed')
        ORDER BY appointment_time
      `, [customerId])
      
      return result.rows
    } catch (error) {
      console.error('Error getting upcoming appointments:', error)
      return []
    }
  },
  
  // Get customer service history
  async getCustomerServices(customerId) {
    try {
      const result = await query(`
        SELECT DISTINCT service
        FROM appointments
        WHERE customer_id = $1
        AND status = 'completed'
      `, [customerId])
      
      return result.rows.map(row => row.service)
    } catch (error) {
      console.error('Error getting services:', error)
      return []
    }
  },
  
  // Create new customer
  async createCustomer(customerData) {
    try {
      const { name, phone, email, preferred_stylist } = customerData
      
      const result = await query(`
        INSERT INTO customers (name, phone, email, preferred_stylist)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [name, phone, email, preferred_stylist])
      
      return result.rows[0]
    } catch (error) {
      console.error('Error creating customer:', error)
      return null
    }
  },
  
  // Get available stylists
  async getAvailableStylists(date = null) {
    try {
      let queryStr = `
        SELECT DISTINCT stylist
        FROM appointments
        WHERE status = 'scheduled'
      `
      
      const params = []
      
      if (date) {
        queryStr += ` AND DATE(appointment_time) = $1`
        params.push(date)
      }
      
      const result = await query(queryStr, params)
      return result.rows.map(row => row.stylist)
    } catch (error) {
      console.error('Error getting stylists:', error)
      return ['Riya Sharma', 'Aditi Verma', 'Priya Singh', 'Neha Gupta', 'Anjali Desai']
    }
  },
  
  // Get services and prices
  async getServicesAndPrices() {
    try {
      const result = await query(`
        SELECT 
          service,
          AVG(price) as avg_price,
          COUNT(*) as total_bookings
        FROM appointments
        WHERE price > 0
        GROUP BY service
        ORDER BY total_bookings DESC
      `)
      
      return result.rows
    } catch (error) {
      console.error('Error getting services:', error)
      return [
        { service: 'Haircut', avg_price: 40.00, total_bookings: 100 },
        { service: 'Hair Spa', avg_price: 75.00, total_bookings: 80 },
        { service: 'Keratin', avg_price: 120.00, total_bookings: 60 },
        { service: 'Hair Color', avg_price: 85.00, total_bookings: 70 },
        { service: 'Blow Dry', avg_price: 30.00, total_bookings: 90 }
      ]
    }
  },
  
  // Get appointment by ID
  async getAppointmentById(appointmentId) {
    try {
      const result = await query(`
        SELECT a.*, c.name as customer_name, c.phone as customer_phone
        FROM appointments a
        LEFT JOIN customers c ON a.customer_id = c.id
        WHERE a.appointment_id = $1
      `, [appointmentId])
      
      return result.rows[0]
    } catch (error) {
      console.error('Error getting appointment:', error)
      return null
    }
  }
}