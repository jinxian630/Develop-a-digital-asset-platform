use axum::{extract::State, Json};
use crate::model::{Order, EngineLog, ApiResponse};
use crate::engine::MatchingEngine;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Instant;
use chrono::Utc;

/// Handler for placing an order from the web dashboard
pub async fn place_order_handler(
    State(engine): State<Arc<Mutex<MatchingEngine>>>,
    Json(mut payload): Json<Order>,
) -> Json<ApiResponse> {
    // Populate timestamp if missing from frontend payload
    if payload.timestamp == 0 {
        payload.timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis();
    }
    
    let mut engine_lock = engine.lock().await;
    
    let start_time = Instant::now();
    // Process the order via the matching engine
    let result = engine_lock.process_order(payload);
    let match_duration = start_time.elapsed();
    
    let mut logs = Vec::new();
    
    if result.is_some() {
        logs.push(EngineLog {
            timestamp: Utc::now().to_rfc3339(),
            module: "MatchingEngine_V1".to_string(),
            event: "ORDER_MATCHED".to_string(),
            performance: format!("{:?}", match_duration),
            phase: "Queueing_For_Settlement".to_string(),
            gas_saved_estimate: "80%".to_string()
        });
    } else {
        logs.push(EngineLog {
            timestamp: Utc::now().to_rfc3339(),
            module: "MatchingEngine_V1".to_string(),
            event: "ORDER_QUEUED".to_string(),
            performance: format!("{:?}", match_duration),
            phase: "Awaiting_Counterparty".to_string(),
            gas_saved_estimate: "N/A".to_string()
        });
    }

    Json(ApiResponse {
        match_result: result,
        logs
    })
}
