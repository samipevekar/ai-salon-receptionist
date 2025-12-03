'use client'

import { useState, useEffect } from 'react'
import {
  Phone,
  Clock,
  Calendar,
  Eye,
  X,
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  FileText,
  DollarSign,
  Tag,
  MessageSquare,
  BarChart,
  RefreshCw
} from 'lucide-react'

export default function CallLogs() {
  const [callLogs, setCallLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedLog, setSelectedLog] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [parsedTranscript, setParsedTranscript] = useState([])

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/call-logs")
      const data = await response.json()
      setCallLogs(data.logs || [])
    } catch (error) {
      console.log("Error fetching logs:", error)
    } finally {
      setLoading(false)
    }
  }

  // STATUS ICONS AND COLORS
  const getStatusIcon = (status, isSuccessful) => {
    if (status?.toLowerCase() === "ongoing") {
      return <AlertCircle className="h-5 w-5 text-blue-500 animate-pulse" />
    }
    
    if (isSuccessful === true || status?.toLowerCase() === "completed") {
      return <CheckCircle className="h-5 w-5 text-green-500" />
    }
    
    if (isSuccessful === false || status?.toLowerCase() === "failed") {
      return <XCircle className="h-5 w-5 text-red-500" />
    }
    
    return <AlertCircle className="h-5 w-5 text-gray-500" />
  }

  const getStatusColor = (status, isSuccessful) => {
    if (status?.toLowerCase() === "ongoing") {
      return "bg-blue-100 text-blue-800 border border-blue-200"
    }
    
    if (isSuccessful === true || status?.toLowerCase() === "completed") {
      return "bg-green-100 text-green-800 border border-green-200"
    }
    
    if (isSuccessful === false || status?.toLowerCase() === "failed") {
      return "bg-red-100 text-red-800 border border-red-200"
    }
    
    return "bg-gray-100 text-gray-800 border border-gray-200"
  }

  const getStatusText = (status, isSuccessful) => {
    if (status?.toLowerCase() === "ongoing") return "Ongoing"
    if (isSuccessful === true || status?.toLowerCase() === "completed") return "Completed"
    if (isSuccessful === false || status?.toLowerCase() === "failed") return "Failed"
    return status || "Unknown"
  }

  // SAFELY PARSE TRANSCRIPT
  const parseTranscript = (transcriptData) => {
    if (!transcriptData) return []
    
    try {
      // Handle different transcript formats
      if (typeof transcriptData === 'string') {
        // Clean the string - remove extra quotes and fix formatting
        let cleanTranscript = transcriptData.trim()
        
        // Handle cases like "assistant, Hello" instead of ["assistant", "Hello"]
        if (cleanTranscript.startsWith('"') && cleanTranscript.endsWith('"')) {
          cleanTranscript = cleanTranscript.slice(1, -1)
        }
        
        // Try to parse as JSON first
        try {
          const parsed = JSON.parse(cleanTranscript)
          if (Array.isArray(parsed)) return parsed
        } catch {
          // If JSON parsing fails, try to parse as comma-separated
          if (cleanTranscript.includes(',')) {
            const parts = cleanTranscript.split(',')
            if (parts.length >= 2) {
              return [[parts[0].trim(), parts.slice(1).join(',').trim()]]
            }
          }
          // If all else fails, return as plain message
          return [["assistant", cleanTranscript]]
        }
      } else if (Array.isArray(transcriptData)) {
        return transcriptData
      }
      
      return []
    } catch (error) {
      console.error("Error parsing transcript:", error)
      return []
    }
  }

  // FORMAT TRANSCRIPT FOR DISPLAY
  const renderTranscript = (transcriptData) => {
    const parsed = parseTranscript(transcriptData)
    
    if (parsed.length === 0) {
      return (
        <div className="text-center py-10 text-gray-500">
          No transcript available for this call
        </div>
      )
    }

    return parsed.map((item, index) => {
      if (!item || !Array.isArray(item) || item.length < 2) return null
      
      const [sender, message] = item
      const cleanMessage = message?.toString().trim()
      
      if (!cleanMessage || cleanMessage === "") return null

      return (
        <div
          key={index}
          className={`flex mb-3 ${
            sender === "assistant" ? "justify-start" : "justify-end"
          }`}
        >
          <div
            className={`px-4 py-3 rounded-2xl max-w-md text-sm shadow-sm ${
              sender === "assistant"
                ? "bg-blue-50 text-gray-800 border border-blue-100"
                : "bg-green-500 text-white border border-green-600"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className={`h-2 w-2 rounded-full ${sender === "assistant" ? 'bg-blue-500' : 'bg-white'}`}></div>
              <p className="font-semibold text-xs capitalize">
                {sender === "assistant" ? "AI Receptionist" : "Customer"}
              </p>
            </div>
            <p className="text-sm">{cleanMessage}</p>
          </div>
        </div>
      )
    })
  }

  // PROCESS CALL DATA FROM POST-CALL WEBHOOK
  const processLogData = (log) => {
    if (!log.metadata) return log
    
    try {
      const metadata = typeof log.metadata === 'string' 
        ? JSON.parse(log.metadata) 
        : log.metadata
      
      const isSuccessful = metadata.isSuccessful !== false // Consider true if not explicitly false
      const status = log.status || (isSuccessful ? "completed" : "failed")
      
      // Extract data from post-call webhook format
      return {
        ...log,
        // Extract from metadata
        callId: metadata.sessionId || log.callId,
        customerName: metadata.customerInfo?.name || log.customerName || "Anonymous Customer",
        customerPhone: metadata.fromPhoneNumber || log.customerPhone,
        transcript: metadata.transcript || log.transcript,
        summary: metadata.summary || log.summary,
        intent: metadata.bookingDetails?.service 
          ? `Service: ${metadata.bookingDetails.service}` 
          : log.intent,
        bookingDecision: metadata.isSuccessful ? "Booked" : "Not Booked",
        duration: metadata.callDuration || log.duration,
        status: status,
        isSuccessful: isSuccessful,
        
        // Additional extracted fields
        callType: metadata.callType,
        sessionType: metadata.sessionType,
        callCost: metadata.callCost,
        disconnectionReason: metadata.disconnectionReason,
        createdAt: metadata.createdAt || log.createdAt,
        endedAt: metadata.endedAt,
        bookingDetails: metadata.bookingDetails || {},
        customerInfo: metadata.customerInfo || {}
      }
    } catch (error) {
      console.error("Error processing log data:", error)
      return {
        ...log,
        isSuccessful: log.status !== "failed",
        bookingDetails: {},
        customerInfo: {},
      }
    }
  }

  // Handle view details click
  const handleViewDetails = (log) => {
    const processedLog = processLogData(log)
    setSelectedLog(processedLog)
    
    // Parse transcript immediately to catch errors
    const parsed = parseTranscript(processedLog.transcript)
    setParsedTranscript(parsed)
    
    setShowModal(true)
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Call Logs</h2>
          <p className="text-gray-600">View all salon receptionist call history</p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          {loading ? "Refreshing..." : "Refresh Logs"}
        </button>
      </div>

      {/* LOADING STATE */}
      {loading && (
        <div className="text-center py-16">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading call logs...</p>
        </div>
      )}

      {/* HORIZONTAL CALL LOGS LIST */}
      {!loading && callLogs.length > 0 && (
        <div className="space-y-4">
          {callLogs.map((log) => {
            const processedLog = processLogData(log)
            const statusText = getStatusText(processedLog.status, processedLog.isSuccessful)
            
            return (
              <div
                key={processedLog.id}
                className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-lg transition-all duration-300"
              >
                <div className="flex items-center justify-between">
                  {/* LEFT SIDE - BASIC INFO */}
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex-shrink-0">
                      {getStatusIcon(processedLog.status, processedLog.isSuccessful)}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-2">
                        <h3 className="font-bold text-gray-900">
                          {processedLog.customerName}
                        </h3>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            processedLog.status,
                            processedLog.isSuccessful
                          )}`}
                        >
                          {statusText}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-6 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Phone size={14} />
                          <span>{processedLog.customerPhone || "No phone"}</span>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <Clock size={14} />
                          <span>{processedLog.duration || "0:00"}</span>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <Calendar size={14} />
                          <span>
                            {new Date(processedLog.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <DollarSign size={14} />
                          <span>
                            ${processedLog.callCost ? processedLog.callCost.toFixed(2) : "0.00"}
                          </span>
                        </div>
                      </div>
                      
                      {/* INTENT & SUMMARY PREVIEW */}
                      <div className="mt-3 flex items-center gap-4">
                        {processedLog.intent && (
                          <div className="flex items-center gap-1 text-sm">
                            <Tag size={14} className="text-blue-500" />
                            <span className="text-gray-700">{processedLog.intent}</span>
                          </div>
                        )}
                        
                        {processedLog.summary && (
                          <div className="text-sm text-gray-500 truncate max-w-md">
                            {processedLog.summary.length > 100 
                              ? processedLog.summary.substring(0, 100) + "..." 
                              : processedLog.summary}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* RIGHT SIDE - VIEW BUTTON */}
                  <div className="flex-shrink-0">
                    <button
                      onClick={() => handleViewDetails(log)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition border border-blue-200"
                    >
                      <Eye size={16} />
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* NO DATA */}
      {!loading && callLogs.length === 0 && (
        <div className="text-center py-20 bg-gradient-to-br from-gray-50 to-white rounded-2xl border-2 border-dashed border-gray-300">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="h-10 w-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Call Logs Yet</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Make your first test call from OpenMic dashboard to see call logs appear here.
          </p>
        </div>
      )}

      {/* DETAIL MODAL */}
      {showModal && selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl p-6 overflow-y-auto max-h-[90vh] relative">
            {/* CLOSE BUTTON */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute right-6 top-6 text-gray-400 hover:text-gray-700 z-10 bg-white p-2 rounded-full hover:bg-gray-100"
            >
              <X className="h-6 w-6" />
            </button>

            {/* MODAL HEADER */}
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Call Details</h3>
              <div className="flex items-center gap-3">
                {getStatusIcon(selectedLog.status, selectedLog.isSuccessful)}
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                  selectedLog.status,
                  selectedLog.isSuccessful
                )}`}>
                  {getStatusText(selectedLog.status, selectedLog.isSuccessful).toUpperCase()}
                </span>
                <span className="text-gray-500">•</span>
                <span className="text-gray-600">
                  {new Date(selectedLog.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            {/* TWO COLUMN LAYOUT */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* LEFT COLUMN - BASIC INFO */}
              <div className="lg:col-span-1 space-y-6">
                {/* CALLER INFO CARD */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
                  <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <User size={18} />
                    Caller Information
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500">Name</p>
                      <p className="font-medium">{selectedLog.customerName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Phone Number</p>
                      <p className="font-medium">{selectedLog.customerPhone || "Not provided"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Customer ID</p>
                      <p className="font-mono text-sm">{selectedLog.customerInfo?.id || "N/A"}</p>
                    </div>
                  </div>
                </div>

                {/* CALL METRICS CARD */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                  <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <BarChart size={18} />
                    Call Metrics
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Duration</span>
                      <span className="font-medium">{selectedLog.duration}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Call Cost</span>
                      <span className="font-medium">${selectedLog.callCost?.toFixed(2) || "0.00"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Call Type</span>
                      <span className="font-medium capitalize">{selectedLog.callType || "webcall"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Session Type</span>
                      <span className="font-medium capitalize">{selectedLog.sessionType || "chat"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">End Reason</span>
                      <span className="font-medium">
                        {selectedLog.disconnectionReason?.replace(/_/g, ' ') || "User ended call"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* BOOKING DETAILS CARD */}
                {(selectedLog.bookingDetails?.service || selectedLog.bookingDecision) && (
                  <div className="bg-green-50 border border-green-100 rounded-xl p-5">
                    <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Calendar size={18} />
                      Booking Details
                    </h4>
                    <div className="space-y-3">
                      {selectedLog.bookingDetails?.service && (
                        <div>
                          <p className="text-xs text-gray-500">Service Requested</p>
                          <p className="font-medium capitalize">{selectedLog.bookingDetails.service}</p>
                        </div>
                      )}
                      {selectedLog.bookingDetails?.stylist && (
                        <div>
                          <p className="text-xs text-gray-500">Preferred Stylist</p>
                          <p className="font-medium">{selectedLog.bookingDetails.stylist}</p>
                        </div>
                      )}
                      {selectedLog.bookingDetails?.time && (
                        <div>
                          <p className="text-xs text-gray-500">Requested Time</p>
                          <p className="font-medium">{selectedLog.bookingDetails.time}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-gray-500">Booking Status</p>
                        <p className={`font-medium ${selectedLog?.booking_decision == 'No booking made' ? "text-red-600" : "text-green-600"}`}>
                          {selectedLog?.booking_decision == 'No booking made' ? "Not Booked" : "Booked"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN - TRANSCRIPT & SUMMARY */}
              <div className="lg:col-span-2 space-y-6">
                {/* SUMMARY CARD */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <FileText size={18} />
                    Call Summary
                  </h4>
                  <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-blue-100">
                    <p className="text-gray-800 leading-relaxed">
                      {selectedLog.summary || "No summary available"}
                    </p>
                  </div>
                </div>

                {/* TRANSCRIPT CARD */}
                <div className="border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                      <MessageSquare size={18} />
                      Chat Transcript
                    </h4>
                    <span className="text-sm text-gray-500">
                      {parsedTranscript.length} messages
                    </span>
                  </div>
                  
                  <div className="bg-gray-50 p-4 rounded-lg h-96 overflow-y-auto space-y-2">
                    {parsedTranscript.length > 0 ? (
                      parsedTranscript.map((item, index) => {
                        if (!item || !Array.isArray(item) || item.length < 2) return null
                        
                        const [sender, message] = item
                        const cleanMessage = message?.toString().trim()
                        
                        if (!cleanMessage || cleanMessage === "") return null

                        return (
                          <div
                            key={index}
                            className={`flex mb-3 ${
                              sender === "assistant" ? "justify-start" : "justify-end"
                            }`}
                          >
                            <div
                              className={`px-4 py-3 rounded-2xl max-w-md text-sm shadow-sm ${
                                sender === "assistant"
                                  ? "bg-blue-50 text-gray-800 border border-blue-100"
                                  : "bg-green-500 text-white border border-green-600"
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <div className={`h-2 w-2 rounded-full ${sender === "assistant" ? 'bg-blue-500' : 'bg-white'}`}></div>
                                <p className="font-semibold text-xs capitalize">
                                  {sender === "assistant" ? "AI Receptionist" : "Customer"}
                                </p>
                              </div>
                              <p className="text-sm">{cleanMessage}</p>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="text-center py-10 text-gray-500">
                        No transcript available for this call
                      </div>
                    )}
                  </div>
                </div>

                {/* RAW METADATA (COLLAPSIBLE) */}
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <details>
                    <summary className="p-5 bg-gray-50 font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Tag size={18} />
                        Raw Metadata
                      </span>
                      <span className="text-sm font-normal text-gray-500">Click to expand</span>
                    </summary>
                    <div className="p-4 bg-gray-900">
                      <pre className="text-gray-100 text-xs overflow-x-auto">
                        {JSON.stringify({
                          callId: selectedLog.callId,
                          sessionId: selectedLog.callId,
                          status: selectedLog.status,
                          isSuccessful: selectedLog.isSuccessful,
                          createdAt: selectedLog.createdAt,
                          endedAt: selectedLog.endedAt,
                          duration: selectedLog.duration,
                          callCost: selectedLog.callCost,
                          callType: selectedLog.callType,
                          sessionType: selectedLog.sessionType,
                          customerInfo: selectedLog.customerInfo,
                          bookingDetails: selectedLog.bookingDetails,
                          disconnectionReason: selectedLog.disconnectionReason
                        }, null, 2)}
                      </pre>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}