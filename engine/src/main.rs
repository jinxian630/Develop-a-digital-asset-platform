mod order;
mod orderbook;
mod routes;
mod types;

use axum::{
    routing::{delete, get, post},
    Router,
};
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};

use orderbook::OrderBook;
use routes::{delete_order, get_orderbook, post_order, SharedBook};

#[tokio::main]
async fn main() {
    // Shared in-memory order book — wrapped in Arc<Mutex> for thread safety
    let book: SharedBook = Arc::new(Mutex::new(OrderBook::new()));

    // CORS — allow requests from the Next.js frontend on port 3000
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/order", post(post_order))
        .route("/orderbook", get(get_orderbook))
        .route("/order/:id", delete(delete_order))
        .with_state(book)
        .layer(cors);

    let port = std::env::var("ENGINE_PORT").unwrap_or_else(|_| "8080".to_string());
    let addr = format!("0.0.0.0:{}", port);

    println!("HEX Matching Engine running on http://localhost:{}", port);
    println!("Endpoints:");
    println!("  POST   /order");
    println!("  GET    /orderbook");
    println!("  DELETE /order/:id");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}