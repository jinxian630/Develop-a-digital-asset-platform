use std::collections::{BTreeMap, VecDeque};
use crate::order::{Order, Side};

pub const MIN_TRADE_AMOUNT: u64 = 1;

pub struct OrderBook {
    // Bids: buy orders — keyed by price descending (highest bid first)
    // We negate the key to achieve descending order with BTreeMap
    pub bids: BTreeMap<u64, VecDeque<Order>>,

    // Asks: sell orders — keyed by price ascending (lowest ask first)
    pub asks: BTreeMap<u64, VecDeque<Order>>,
}

impl OrderBook {
    pub fn new() -> Self {
        OrderBook {
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
        }
    }

    /// Add a new order to the book.
    /// Returns Err if the order fails validation.
    pub fn add_order(&mut self, order: Order) -> Result<(), String> {
        // Validate amount before accepting
        if order.amount < MIN_TRADE_AMOUNT {
            return Err(format!(
                "Amount {} is below minimum trade amount {}",
                order.amount, MIN_TRADE_AMOUNT
            ));
        }

        match order.side {
            Side::Buy => {
                self.bids
                    .entry(order.price)
                    .or_insert_with(VecDeque::new)
                    .push_back(order);
            }
            Side::Sell => {
                self.asks
                    .entry(order.price)
                    .or_insert_with(VecDeque::new)
                    .push_back(order);
            }
        }
        Ok(())
    }

    /// Attempt to match the best bid against the best ask.
    ///
    /// Matching condition: highest bid price >= lowest ask price.
    /// FIFO: within the same price level, oldest order matches first.
    ///
    /// Returns Some((buy_order, sell_order)) if a match is found.
    pub fn match_orders(&mut self) -> Option<(Order, Order)> {
        // Find best bid (highest price)
        let best_bid_price = *self.bids.keys().next_back()?;

        // Find best ask (lowest price)
        let best_ask_price = *self.asks.keys().next()?;

        // Prices must cross for a match
        if best_bid_price < best_ask_price {
            return None;
        }

        // Pop the oldest order at each price level (FIFO)
        let buy_order = self
            .bids
            .get_mut(&best_bid_price)?
            .pop_front()?;

        let sell_order = self
            .asks
            .get_mut(&best_ask_price)?
            .pop_front()?;

        // Clean up empty price levels
        if self.bids.get(&best_bid_price).map_or(true, |q| q.is_empty()) {
            self.bids.remove(&best_bid_price);
        }
        if self.asks.get(&best_ask_price).map_or(true, |q| q.is_empty()) {
            self.asks.remove(&best_ask_price);
        }

        Some((buy_order, sell_order))
    }

    /// Cancel an order by ID from either side.
    /// Returns true if the order was found and removed.
    pub fn cancel_order(&mut self, order_id: uuid::Uuid) -> bool {
        for queue in self.bids.values_mut() {
            if let Some(pos) = queue.iter().position(|o| o.id == order_id) {
                queue.remove(pos);
                return true;
            }
        }
        for queue in self.asks.values_mut() {
            if let Some(pos) = queue.iter().position(|o| o.id == order_id) {
                queue.remove(pos);
                return true;
            }
        }
        false
    }
}
