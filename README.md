# Salon Receptionist AI Agent - OpenMic Integration

An AI-powered virtual receptionist for salons built with Next.js and OpenMic API. This system handles customer calls, manages appointments, and provides a complete bot management interface.

## 🎯 Features

### 🤖 Bot Management
- Create, edit, and delete AI bots
- Custom system prompts for salon receptionist

### 📞 Call Handling
- **Pre-call Webhook**: Fetch customer info before calls
- **In-call Functions**: Real-time appointment management
- **Post-call Webhook**: Store call transcripts and summaries

### 📊 Call Logs Dashboard
- View all call history with transcripts
- See call summaries and booking decisions
- View raw metadata and function call logs

### 🏪 Salon Functions
- Appointment management 
- Stylist availability checking
- Service price lists
- Customer history tracking
- Slot availability for next 7 days


## 🚀 Quick Start

### 1. Prerequisites
- Node.js 18+ and npm
- PostgreSQL database
- OpenMic account (for AI agent)
- Ngrok (for local webhook testing)

### 2. Installation

```bash
# Clone the repository
git clone https://github.com/samipevekar/ai-salon-receptionist.git
cd ai-salon-receptionist

# Install dependencies
npm install

# Set up environment variables
.env.local

# Run development server
npm run dev
```

### 3. Database tables
```bash
#bots table
CREATE TABLE IF NOT EXISTS bots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    prompt TEXT NOT NULL,
    webhook_url VARCHAR(500),
    domain VARCHAR(100) DEFAULT 'salon-receptionist',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

#call_log table
CREATE TABLE IF NOT EXISTS call_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    call_id VARCHAR(100) UNIQUE NOT NULL,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),
    transcript JSONB,
    summary TEXT,
    intent VARCHAR(100),
    booking_decision VARCHAR(50),
    duration VARCHAR(50),
    status VARCHAR(50) DEFAULT 'completed',
    metadata JSONB,
    bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

#customers table
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(100),
    preferred_stylist VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

#appointments table
CREATE TABLE appointments (
    id SERIAL PRIMARY KEY,
    appointment_id VARCHAR(50) UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    service VARCHAR(100) NOT NULL,
    stylist VARCHAR(100) NOT NULL,
    appointment_time TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled',
    price NUMERIC(10, 2),
    created_at TIMESTAMP DEFAULT NOW()
);
```


### Made with ❤️ by Sami Pevekar