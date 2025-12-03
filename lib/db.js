import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const query = (text, params) => pool.query(text, params);

// Initialize database tables
// export const initDB = async () => {
//   try {
//     // Drop tables if they exist (for development)
//     // await query(`
//     //   DROP TABLE IF EXISTS function_logs;
//     //   DROP TABLE IF EXISTS call_logs;
//     //   DROP TABLE IF EXISTS bots;
//     // `);

//     // Create bots table
//     await query(`
//       CREATE TABLE bots (
//         id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid(),
//         name VARCHAR(100) NOT NULL,
//         description TEXT,
//         prompt TEXT NOT NULL,
//         webhook_url VARCHAR(255),
//         openmic_id VARCHAR(100),
//         is_active BOOLEAN DEFAULT true,
//         created_at TIMESTAMP DEFAULT NOW(),
//         updated_at TIMESTAMP DEFAULT NOW()
//       );
//     `);

//     // Create call_logs table
//     await query(`
//       CREATE TABLE call_logs (
//         id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid(),
//         call_id VARCHAR(100) UNIQUE NOT NULL,
//         customer_name VARCHAR(100),
//         customer_phone VARCHAR(20),
//         transcript TEXT,
//         summary TEXT,
//         intent VARCHAR(100),
//         booking_decision VARCHAR(100),
//         duration VARCHAR(20),
//         status VARCHAR(50) DEFAULT 'completed',
//         metadata JSONB,
//         bot_id VARCHAR(50) REFERENCES bots(id) ON DELETE CASCADE,
//         created_at TIMESTAMP DEFAULT NOW()
//       );
      
//       CREATE INDEX idx_call_logs_bot_id ON call_logs(bot_id);
//       CREATE INDEX idx_call_logs_created_at ON call_logs(created_at);
//     `);

//     // Create function_logs table
//     await query(`
//       CREATE TABLE function_logs (
//         id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid(),
//         call_id VARCHAR(100) NOT NULL,
//         function_name VARCHAR(100) NOT NULL,
//         request_data JSONB NOT NULL,
//         response_data JSONB NOT NULL,
//         timestamp TIMESTAMP DEFAULT NOW(),
        
//         FOREIGN KEY (call_id) REFERENCES call_logs(call_id) ON DELETE CASCADE
//       );
      
//       CREATE INDEX idx_function_logs_call_id ON function_logs(call_id);
//     `);

//     console.log('✅ Database tables created successfully');
//   } catch (error) {
//     console.error('❌ Error creating database tables:', error);
//     throw error;
//   }
// };

// initDB();