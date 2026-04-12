use std::collections::BinaryHeap;
use std::cmp::Ordering;
use crate::model::{Order, OrderSide, MatchResult};

/// Wrapper around `Order` to implement custom Heap ordering for price-time priority.
#[derive(PartialEq, Eq)]
pub struct HeapOrder(pub Order);

// Reverse ordering for Min-Heap (Sells). Buys use Max-Heap.
impl Ord for HeapOrder {
    fn cmp(&self, other: &Self) -> Ordering {
        if self.0.side == OrderSide::Sell {
            // Min-Heap for Sells: lowest price first
            // If prices are equal, earliest timestamp first (time priority)
            other.0.price.cmp(&self.0.price)
                .then_with(|| other.0.timestamp.cmp(&self.0.timestamp))
        } else {
            // Max-Heap for Buys: highest price first
            // If prices are equal, earliest timestamp first (time priority)
            self.0.price.cmp(&other.0.price)
                .then_with(|| other.0.timestamp.cmp(&self.0.timestamp))
        }
    }
}

impl PartialOrd for HeapOrder {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// The core off-chain matching engine holding resting buy and sell orders.
#[derive(Default)]
pub struct MatchingEngine {
    pub buy_side: BinaryHeap<HeapOrder>,
    pub sell_side: BinaryHeap<HeapOrder>,
}

impl MatchingEngine {
    /// Creates a new, empty `MatchingEngine`.
    pub fn new() -> Self {
        Self::default()
    }

    /// Processes a new `Order`, either matching it against the resting book or adding it to the book.
    pub fn process_order(&mut self, new_order: Order) -> Option<MatchResult> {
        match new_order.side {
            OrderSide::Buy => self.match_buy(new_order),
            OrderSide::Sell => self.match_sell(new_order),
        }
    }

    fn match_buy(&mut self, buy: Order) -> Option<MatchResult> {
        if let Some(top_sell) = self.sell_side.peek() {
            if buy.price >= top_sell.0.price {
                let sell = self.sell_side.pop().unwrap().0;
                
                // Assuming full match for now as per simple model
                // In a production engine, you'd handle partial fills here
                return Some(MatchResult {
                    buy_order_id: buy.id,
                    sell_order_id: sell.id,
                    matched_price: sell.price, // Match occurs at the existing resting order's price
                    matched_amount: buy.amount.min(sell.amount),
                });
            }
        }
        self.buy_side.push(HeapOrder(buy));
        None
    }

    fn match_sell(&mut self, sell: Order) -> Option<MatchResult> {
        if let Some(top_buy) = self.buy_side.peek() {
            if sell.price <= top_buy.0.price {
                let buy = self.buy_side.pop().unwrap().0;
                
                // Assuming full match for now as per simple model
                return Some(MatchResult {
                    buy_order_id: buy.id,
                    sell_order_id: sell.id,
                    matched_price: buy.price, // Match occurs at the existing resting order's price
                    matched_amount: sell.amount.min(buy.amount),
                });
            }
        }
        self.sell_side.push(HeapOrder(sell));
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::*;

    #[test]
    fn test_immediate_match() {
        let mut engine = MatchingEngine::new();
        let buy = Order { id: 1, player_address: "A".into(), asset: "HEX".into(), price: 100, amount: 1, side: OrderSide::Buy, timestamp: 1 };
        let sell = Order { id: 2, player_address: "B".into(), asset: "HEX".into(), price: 90, amount: 1, side: OrderSide::Sell, timestamp: 2 };
        
        engine.process_order(buy);
        let res = engine.process_order(sell);
        
        assert!(res.is_some());
        assert_eq!(res.unwrap().matched_price, 100);
    }

    #[test]
    fn test_no_match_low_price() {
        let mut engine = MatchingEngine::new();
        let buy = Order { id: 1, player_address: "A".into(), asset: "HEX".into(), price: 80, amount: 1, side: OrderSide::Buy, timestamp: 1 };
        let sell = Order { id: 2, player_address: "B".into(), asset: "HEX".into(), price: 90, amount: 1, side: OrderSide::Sell, timestamp: 2 };
        
        engine.process_order(buy);
        let res = engine.process_order(sell);
        
        assert!(res.is_none());
    }
}
