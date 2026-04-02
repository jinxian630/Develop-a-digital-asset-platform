use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{info, warn, Level};

use matching_engine::model::MatchResult;
use matching_engine::engine::MatchingEngine;
use matching_engine::api;

use axum::{
    routing::post,
    Router,
};
use tower_http::cors::{CorsLayer, Any};

// --- Phase 4: Simulated Blockchain Settlement Stub ---
// In a real project using `ethers-rs`, this would be an async function 
// sending a transaction to `HEXStablecoin.sol`
async fn submit_batch_to_evm(batch_size: usize) {
    info!("[EVM] Initiating smart contract call for batch of {} matches...", batch_size);
    // Simulate network latency
    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
    info!("[EVM] Batch Settlement Transaction Confirmed! 80% Gas saved.");
}

// --- Module 3: Batching & Settlement Pool ---
// This struct manages the queue before sending transactions to the blockchain
pub struct TransactionPool {
    pub pending_matches: Vec<MatchResult>,
    pub batch_limit: usize,
}

impl TransactionPool {
    pub fn new(limit: usize) -> Self {
        Self {
            pending_matches: Vec::new(),
            batch_limit: limit,
        }
    }

    // Add a matched order result to the pool and check if it's ready for batching
    pub async fn push_matched_result(&mut self, match_result: MatchResult) {
        info!("Adding Match (Buy #{} / Sell #{}) to the batch queue...", 
                 match_result.buy_order_id, match_result.sell_order_id);
        
        self.pending_matches.push(match_result);

        if self.pending_matches.len() >= self.batch_limit {
            self.execute_batch_settlement().await;
        }
    }

    // Phase 5: Trigger the on-chain settlement logic
    async fn execute_batch_settlement(&mut self) {
        warn!("[PHASE 5: ON-CHAIN SETTLEMENT]");
        info!("Batch threshold reached: {} matches. Compressing data...", self.pending_matches.len());
        
        // Asynchronously call the mock EVM layer without blocking the engine
        let size = self.pending_matches.len();
        tokio::spawn(async move {
            submit_batch_to_evm(size).await;
        });
        
        self.pending_matches.clear(); // Flush the pool for the next batch
        info!("Queue cleared for next batch.\n");
    }
}

#[tokio::main]
async fn main() {
    // Initialize structured logging
    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .init();

    info!("--- HEX High-Performance Matching Engine Started ---");

    // Initialize the engine and the pool
    // Wrapping the engine in an Arc<Mutex> allows concurrent access from multiple tokio tasks
    let engine = Arc::new(Mutex::new(MatchingEngine::new()));
    // let pool = Arc::new(Mutex::new(TransactionPool::new(3))); // Batch limit of 3 (Optional: integrate this in api handler later for actual web orders)

    // Setup CORS layer so Next.js frontend can communicate
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build the Axum router
    let app = Router::new()
        .route("/place-order", post(api::place_order_handler))
        .layer(cors)
        .with_state(engine); // Share the MatchingEngine state with handlers

    // Start the server
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    info!("Server is running! Listening on http://0.0.0.0:8080");
    
    axum::serve(listener, app).await.unwrap();
}