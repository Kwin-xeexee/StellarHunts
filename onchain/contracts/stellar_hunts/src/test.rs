#![cfg(test)]

use crate::{StellarHunts, StellarHuntsClient};
// Brings `Address::generate` into scope as an extension trait method.
use soroban_sdk::testutils::Address as _;
use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
use soroban_sdk::{Address, Bytes, BytesN, Env, Vec};

/// Generate a fresh admin address (distinct from the destructured binding
/// returned by `init_with_admin`).
fn new_admin(env: &Env) -> Address {
    Address::generate(env)
}

fn user(env: &Env) -> Address {
    Address::generate(env)
}

fn b(env: &Env, s: &str) -> Bytes {
    Bytes::from_slice(env, s.as_bytes())
}

// ---------------------------------------------------------------------
// Helper: init contract with selective auth for the `init` call
// ---------------------------------------------------------------------

/// Register the contract, grant admin auth specifically for `init`, then
/// call `init`.  Returns `(admin, contract_address, client)` so callers
/// can set up further `mock_auths` for subsequent admin/player calls.
fn init_with_admin(env: &Env) -> (Address, Address, StellarHuntsClient) {
    let admin = new_admin(env);
    let contract_id: BytesN<32> = env.register_contract(None, StellarHunts);
    let contract_address = Address::from_contract_id(env, &contract_id);
    let client = StellarHuntsClient::new(env, &contract_id);

    // Grant admin auth **only** for the `init` call.
    env.mock_auths(&[MockAuth {
        address: admin.clone(),
        invoke: MockAuthInvoke {
            contract: contract_address.clone(),
            fn_name: "init",
            args: Vec::new(env),
            sub_invokes: Vec::new(env),
        },
    }]);

    client.init(&admin);
    (admin, contract_address, client)
}

// ---------------------------------------------------------------------
// Positive: admin can set question per level
// ---------------------------------------------------------------------

#[test]
fn test_set_question_per_level_admin_only() {
    let env = Env::default();
    let (admin, contract_address, client) = init_with_admin(&env);

    env.mock_auths(&[MockAuth {
        address: admin.clone(),
        invoke: MockAuthInvoke {
            contract: contract_address.clone(),
            fn_name: "set_question_per_level",
            args: Vec::new(env),
            sub_invokes: Vec::new(env),
        },
    }]);

    client.set_question_per_level(&5u32);
    assert_eq!(client.get_question_per_level(), 5);
}

// ---------------------------------------------------------------------
// Negative: non-admin calling set_question_per_level should panic
// ---------------------------------------------------------------------

#[test]
fn test_set_question_per_level_unauthorized() {
    let env = Env::default();
    let (_admin, _contract_address, client) = init_with_admin(&env);

    // No mock auth for admin + "set_question_per_level" → require_auth fails.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_question_per_level(&5u32);
    }));
    assert!(result.is_err(), "non-admin should not be able to set_question_per_level");
}

// ---------------------------------------------------------------------
// Positive: add question and get it back
// ---------------------------------------------------------------------

#[test]
fn test_add_and_get_question() {
    let env = Env::default();
    let (admin, contract_address, client) = init_with_admin(&env);

    let level = crate::Levels::Easy;
    let question = b(&env, "What is the capital of France?");
    let answer = b(&env, "Paris");
    let hint = b(&env, "It starts with P");

    // Set up admin auth for both admin-only calls.
    env.mock_auths(&[
        MockAuth {
            address: admin.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "set_question_per_level",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
        MockAuth {
            address: admin.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "add_question",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
    ]);

    client.set_question_per_level(&5u32);
    client.add_question(&level, &question, &answer, &hint);

    let got = client.get_question(&1u64);
    assert_eq!(got.question_id, 1);
}

// ---------------------------------------------------------------------
// Negative: non-admin calling add_question should panic
// ---------------------------------------------------------------------

#[test]
fn test_add_question_unauthorized() {
    let env = Env::default();
    let (_admin, _contract_address, client) = init_with_admin(&env);

    let level = crate::Levels::Easy;
    let question = b(&env, "Should I be here?");
    let answer = b(&env, "No");
    let hint = b(&env, "Only admin can add");

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.add_question(&level, &question, &answer, &hint);
    }));
    assert!(result.is_err(), "non-admin should not be able to add_question");
}

// ---------------------------------------------------------------------
// Correct answer progresses the player
// ---------------------------------------------------------------------

#[test]
fn test_submit_answer_correct_progresses() {
    let env = Env::default();
    let (admin, contract_address, client) = init_with_admin(&env);
    let player = user(&env);

    let level = crate::Levels::Easy;
    let question = b(&env, "What is 2+2?");
    let answer = b(&env, "4");
    let hint = b(&env, "basic math");

    // Set up auths for admin (setup) and player (submit_answer).
    env.mock_auths(&[
        MockAuth {
            address: admin.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "set_question_per_level",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
        MockAuth {
            address: admin.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "add_question",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
        MockAuth {
            address: player.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "submit_answer",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
    ]);

    client.set_question_per_level(&1u32);
    client.add_question(&level, &question, &answer, &hint);

    let ok = client.submit_answer(&player, &1u64, &answer);
    assert!(ok);
    // After 1 of 1 correct answers, level complete and progression to Medium.
    let new_level = client.get_player_level(&player);
    assert_eq!(new_level, crate::Levels::Medium);
}

// ---------------------------------------------------------------------
// Incorrect answer does NOT progress the player
// ---------------------------------------------------------------------

#[test]
fn test_submit_answer_incorrect_does_not_progress() {
    let env = Env::default();
    let (admin, contract_address, client) = init_with_admin(&env);
    let player = user(&env);

    let level = crate::Levels::Easy;
    let question = b(&env, "What is 2+2?");
    let answer = b(&env, "4");
    let wrong = b(&env, "5");
    let hint = b(&env, "basic math");

    env.mock_auths(&[
        MockAuth {
            address: admin.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "set_question_per_level",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
        MockAuth {
            address: admin.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "add_question",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
        MockAuth {
            address: player.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "submit_answer",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
    ]);

    client.set_question_per_level(&1u32);
    client.add_question(&level, &question, &answer, &hint);

    let ok = client.submit_answer(&player, &1u64, &wrong);
    assert!(!ok);
    // Still on Easy.
    let new_level = client.get_player_level(&player);
    assert_eq!(new_level, crate::Levels::Easy);
}

// ---------------------------------------------------------------------
// Hint request after answering a question
// ---------------------------------------------------------------------

#[test]
fn test_request_hint_after_initialize() {
    let env = Env::default();
    let (admin, contract_address, client) = init_with_admin(&env);
    let player = user(&env);

    let level = crate::Levels::Easy;
    let q1 = b(&env, "Q1");
    let a1 = b(&env, "A1");
    let h1 = b(&env, "HINT-X");
    let q2 = b(&env, "Q2");
    let a2 = b(&env, "A2");
    let h2 = b(&env, "HINT-Y");

    env.mock_auths(&[
        MockAuth {
            address: admin.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "set_question_per_level",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
        MockAuth {
            address: admin.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "add_question",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
        MockAuth {
            address: player.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "submit_answer",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
        MockAuth {
            address: player.clone(),
            invoke: MockAuthInvoke {
                contract: contract_address.clone(),
                fn_name: "request_hint",
                args: Vec::new(env),
                sub_invokes: Vec::new(env),
            },
        },
    ]);

    // Two questions per level — answering the first keeps the player on
    // Easy, so a hint request for question 1 remains valid.
    client.set_question_per_level(&2u32);
    client.add_question(&level, &q1, &a1, &h1);
    client.add_question(&level, &q2, &a2, &h2);
    client.submit_answer(&player, &1u64, &a1);

    let hint = client.request_hint(&player, &1u64);
    assert_eq!(hint, h1);
}

// ---------------------------------------------------------------------
// Positive: admin can set NFT contract address
// ---------------------------------------------------------------------

#[test]
fn test_set_nft_contract_address_admin_only() {
    let env = Env::default();
    let (admin, contract_address, client) = init_with_admin(&env);

    let new_addr = Address::generate(&env);

    env.mock_auths(&[MockAuth {
        address: admin.clone(),
        invoke: MockAuthInvoke {
            contract: contract_address.clone(),
            fn_name: "set_nft_contract_address",
            args: Vec::new(env),
            sub_invokes: Vec::new(env),
        },
    }]);

    client.set_nft_contract_address(&new_addr);
    assert_eq!(client.get_nft_contract_address(), new_addr);
}

// ---------------------------------------------------------------------
// Negative: non-admin calling set_nft_contract_address should panic
// ---------------------------------------------------------------------

#[test]
fn test_set_nft_contract_address_unauthorized() {
    let env = Env::default();
    let (_admin, _contract_address, client) = init_with_admin(&env);

    let new_addr = Address::generate(&env);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_nft_contract_address(&new_addr);
    }));
    assert!(
        result.is_err(),
        "non-admin should not be able to set_nft_contract_address"
    );
}

// ---------------------------------------------------------------------
// View function — no auth gates
// ---------------------------------------------------------------------

#[test]
fn test_next_level_logic() {
    let env = Env::default();
    let (_admin, _contract_address, client) = init_with_admin(&env);

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

// ---------------------------------------------------------------------
// Calling any admin function before init must panic with NotInitialized
// ---------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_require_admin_not_initialized() {
    let env = Env::default();
    // Register the contract WITHOUT calling init — admin key is unset.
    let contract_id = env.register_contract(None, StellarHunts);
    let client = StellarHuntsClient::new(&env, &contract_id);

    // Calling any admin-gated function should panic with Error::NotInitialized (#6).
    // No mock auth needed: `require_admin` panics (NotInitialized) before
    // reaching `admin.require_auth()`.
    client.set_question_per_level(&5u32);
}

// ---------------------------------------------------------------------
// Summary of negative-auth coverage added:
//   • test_set_question_per_level_unauthorized
//   • test_add_question_unauthorized
//   • test_set_nft_contract_address_unauthorized
//
// Each verifies that calling an admin-gated function without authorizing
// the admin address for that exact function name causes a panic.
// ---------------------------------------------------------------------
