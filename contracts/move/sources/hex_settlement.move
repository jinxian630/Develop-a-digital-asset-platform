module hex::settlement {
    use sui::coin::{Self, Coin};
    use sui::transfer;
    use sui::tx_context::TxContext;

    /// Atomically swaps two matched coin objects between counterparties.
    /// `_ctx` is required by the Sui Move entry function signature
    /// but is unused here — settlement is purely object-based.
    public entry fun execute_trade<T1, T2>(
        coin_a: Coin<T1>,
        coin_b: Coin<T2>,
        recipient_a: address,
        recipient_b: address,
        _ctx: &mut TxContext
    ) {
        transfer::public_transfer(coin_a, recipient_b);
        transfer::public_transfer(coin_b, recipient_a);
    }
}
