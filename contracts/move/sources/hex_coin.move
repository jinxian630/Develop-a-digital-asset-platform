/// HEX Stablecoin — pegged 1 HEX = 100 MYR
/// Decimals: 2  (100 raw units = 1.00 HEX displayed)
#[allow(duplicate_alias, deprecated_usage, lint(public_entry))]
module hex::hex_coin {
    use sui::coin::{Self, TreasuryCap, Coin};

    /// One-time witness — name MUST be the module name uppercased: hex_coin -> HEX_COIN
    public struct HEX_COIN has drop {}

    /// Called automatically on package publish.
    /// Creates the HEX currency and sends TreasuryCap to the deployer.
    fun init(witness: HEX_COIN, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            2,                   // decimals (100 units = 1.00 HEX)
            b"HEX",
            b"HEX Stablecoin",
            b"MYR-pegged stablecoin on the HEX Hybrid Exchange. 1 HEX = 100 MYR.",
            option::none(),
            ctx
        );

        // Make coin metadata publicly readable on-chain
        transfer::public_freeze_object(metadata);

        // Send TreasuryCap to deployer so they can mint HEX
        transfer::public_transfer(treasury_cap, ctx.sender());
    }

    /// Mint `amount` raw HEX units to `recipient`.
    /// Caller must own TreasuryCap<HEX_COIN>.
    /// amount = 100 => 1.00 HEX displayed.
    public entry fun mint(
        treasury_cap: &mut TreasuryCap<HEX_COIN>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        coin::mint_and_transfer(treasury_cap, amount, recipient, ctx);
    }

    /// Burn HEX coins (for redemption flows).
    public entry fun burn(
        treasury_cap: &mut TreasuryCap<HEX_COIN>,
        coin_in: Coin<HEX_COIN>
    ) {
        coin::burn(treasury_cap, coin_in);
    }
}
