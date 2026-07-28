#![cfg(test)]

use crate::{StellarHunts, StellarHuntsClient};
// Brings `Address::generate` into scope as an extension trait method.
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::Ledger;
use soroban_sdk::{Address, Bytes, Env};

// Renamed to `new_admin` so it does not collide with the destructured
// `admin` Address binding created by `init_with_admin`.
fn new_admin(env: &Env) -> Address {
    Address::generate(env)
}

fn user(env: &Env) -> Address {
    Address::generate(env)
}

fn b(env: &Env, s: &str) -> Bytes {
    Bytes::from_slice(env, s.as_bytes())
}

fn init_with_admin(env: &Env) -> (Address, StellarHuntsClient) {
    let admin = new_admin(env);
    let contract_id = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(env, &contract_id);
    client.init(&admin);
    (admin, client)
}

#[test]
fn test_set_question_per_level_admin_only() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = init_with_admin(&env);

    client.set_question_per_level(&5u32);
    assert_eq!(client.get_question_per_level(), 5);

    // A second admin-only path is not exercised here because `mock_all_auths`
    // satisfies `require_auth` for every caller, so the negative branch
    // cannot be observed. Kept here as a TODO if/when a real-auth test
    // harness is introduced.
}

#[test]
fn test_add_and_get_question() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = init_with_admin(&env);

    client.set_question_per_level(&5u32);
    let level = crate::Levels::Easy;
    let question = b(&env, "What is the capital of France?");
    let answer = b(&env, "Paris");
    let hint = b(&env, "It starts with P");

    client.add_question(&level, &question, &answer, &hint);

    let got = client.get_question(&1u64);
    assert_eq!(got.question_id, 1);
}

#[test]
fn test_submit_answer_correct_progresses() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = init_with_admin(&env);
    let player = user(&env);

    client.set_question_per_level(&1u32);
    let level = crate::Levels::Easy;
    let question = b(&env, "What is 2+2?");
    let answer = b(&env, "4");
    let hint = b(&env, "basic math");
    client.add_question(&level, &question, &answer, &hint);

    let ok = client.submit_answer(&player, &1u64, &answer);
    assert!(ok);
    // After 1 of 1 correct answers, level complete and progression to Medium.
    let new_level = client.get_player_level(&player);
    assert_eq!(new_level, crate::Levels::Medium);
}

#[test]
fn test_submit_answer_incorrect_does_not_progress() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = init_with_admin(&env);
    let player = user(&env);

    client.set_question_per_level(&1u32);
    let level = crate::Levels::Easy;
    let question = b(&env, "What is 2+2?");
    let answer = b(&env, "4");
    let wrong = b(&env, "5");
    let hint = b(&env, "basic math");
    client.add_question(&level, &question, &answer, &hint);

    let ok = client.submit_answer(&player, &1u64, &wrong);
    assert!(!ok);
    // Still on Easy.
    let new_level = client.get_player_level(&player);
    assert_eq!(new_level, crate::Levels::Easy);
}

#[test]
fn test_request_hint_after_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = init_with_admin(&env);
    let player = user(&env);

    // Two questions per level — answering the first keeps the player on
    // Easy, so a hint request for question 1 remains valid.
    client.set_question_per_level(&2u32);
    let level = crate::Levels::Easy;
    let q1 = b(&env, "Q1");
    let a1 = b(&env, "A1");
    let h1 = b(&env, "HINT-X");
    let q2 = b(&env, "Q2");
    let a2 = b(&env, "A2");
    let h2 = b(&env, "HINT-Y");
    client.add_question(&level, &q1, &a1, &h1);
    client.add_question(&level, &q2, &a2, &h2);
    client.submit_answer(&player, &1u64, &a1);

    let hint = client.request_hint(&player, &1u64);
    assert_eq!(hint, h1);
}

#[test]
fn test_set_nft_contract_address_admin_only() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = init_with_admin(&env);

    let new_addr = Address::generate(&env);
    client.set_nft_contract_address(&new_addr);
    assert_eq!(client.get_nft_contract_address(), new_addr);
}

#[test]
fn test_next_level_logic() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = init_with_admin(&env);

    assert_eq!(
        client.next_level(&crate::Levels::Easy),
        crate::Levels::Medium
    );
    assert_eq!(
        client.next_level(&crate::Levels::Medium),
        crate::Levels::Hard
    );
    assert_eq!(
        client.next_level(&crate::Levels::Hard),
        crate::Levels::Master
    );
    assert_eq!(
        client.next_level(&crate::Levels::Master),
        crate::Levels::Master
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_require_admin_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    // Register the contract WITHOUT calling init — admin key is unset.
    let contract_id = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(&env, &contract_id);
    // Calling any admin-gated function should panic with Error::NotInitialized (#6).
    client.set_question_per_level(&5u32);
}

#[test]
fn test_claim_level_completion_nft_retry_safe_on_nft_panic() {
    let env = Env::default();
    env.mock_all_auths();
    // Set a non-zero ledger so the `last_attempt_ledger == current_ledger`
    // check in `submit_answer` (which initialises `last_attempt_ledger` to 0)
    // does not trigger an `AttemptTooSoon` panic.
    env.ledger().set_sequence_number(100_000);

    let admin = new_admin(&env);
    let contract_id = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(&env, &contract_id);
    client.init(&admin);

    let player = user(&env);

    // Register and initialise the NFT contract, granting the game
    // contract the minter role.
    let nft_id = env.register_contract(None, stellar_hunts_nft::StellarHuntsNft);
    let nft_client =
        stellar_hunts_nft::StellarHuntsNftClient::new(&env, &nft_id);
    nft_client.init(
        &admin,
        &contract_id,
        &soroban_sdk::String::from_str(&env, "ipfs://placeholder/"),
        &soroban_sdk::String::from_str(&env, "StellarHuntsBadge"),
        &soroban_sdk::String::from_str(&env, "SHB"),
    );

    // Wire the game contract to the NFT contract.
    client.set_nft_contract_address(&nft_id);

    // Setup: 1 question per level so the player can complete Easy quickly.
    client.set_question_per_level(&1u32);
    let level = crate::Levels::Easy;
    client.add_question(&level, &b(&env, "Q?"), &b(&env, "A"), &b(&env, "H"));

    // Player completes Easy level.
    assert!(client.submit_answer(&player, &1u64, &b(&env, "A")));

    // ---- First mint: success ----
    client.claim_level_completion_nft(&player, &level);
    assert!(nft_client.has_level_badge(&player, &level));

    // Verify the game contract recorded the mint.
    let lp = client.get_player_level_progress(&player, &level);
    assert!(lp.nft_minted);

    // ---- Simulate out-of-sync state ----
    // The NFT contract still holds the badge, but we reset the game
    // contract's nft_minted flag as if a previous cross-contract call
    // was interrupted before the storage write.
    env.as_contract(&contract_id, || {
        let lp_key = crate::DataKey::PlayerLevelProgress(player.clone(), level.clone());
        let mut lp: crate::LevelProgress =
            env.storage().persistent().get(&lp_key).unwrap();
        lp.nft_minted = false;
        env.storage().persistent().set(&lp_key, &lp);
    });

    // Confirm the flag was reset.
    let lp_reset = client.get_player_level_progress(&player, &level);
    assert!(!lp_reset.nft_minted);

    // ---- Second mint attempt: should panic ----
    // The game contract sees nft_minted == false and proceeds to call
    // the NFT contract, which already has the badge -> AlreadyHasBadge.
    let should_panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.claim_level_completion_nft(&player, &level);
    }));
    assert!(
        should_panic.is_err(),
        "expected AlreadyHasBadge panic from NFT contract"
    );

    // ---- Retry-safe assertion ----
    // Because the game contract writes lp.nft_minted = true AFTER the
    // cross-contract call, a panic in the NFT contract means the write
    // never executes. The flag must remain false so the player (or an
    // off-chain retry loop) can safely retry the claim.
    let lp_final = client.get_player_level_progress(&player, &level);
    assert!(
        !lp_final.nft_minted,
        "nft_minted must remain false so claim_level_completion_nft is retry-safe"
    );
}
