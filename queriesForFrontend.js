// latest blocks
// Missing:  miner, miner transactions of last 12 seconds

// query{
//     blocks(start:0,end:6)
//     {
//       block_number,
//       timestamp,
//       block_reward,
//     }
// }



// View all blocks
// Missing: Slot ,Txn ,Fee Recipient ,Gas Used, Gas Limit, Base Fee, Burnt Fees (ETH) 

// query{
//     blocks(start:0,end:10)
//     {
//       block_number,
//       timestamp,
//       block_reward,
//     }
// }



// View a single block
// Missing: Status,Proposed On, Withdrawals, Fee Recipient, Total Difficulty,
// Size, Gas Used, Gas Limit, Base Fee Per Gas, Burnt Fees, Extra Data,Parent Hash,
// WithdrawalsRoot, Nonce

// query{
//     block(number:"1")
//     {
//         id,
//         version,
//         merkle_root,
//         block_number,
//         previous_hash,
//         state_root,
//         transaction_root,
//         reciept_root,
//         timestamp,
//         logs_bloom,
//         transactions,
//         block_reward,
//         value,
//         data,
//         to,
//         block_has
//      } 
// }



// latest transactions
// Missing: NONE
// query{
//     transactions(start:0,end:6)
//     {
//       hash,
//       from,
//       to,
//       value,
//       transaction_time,
//       unix_timestamp,
//     }
// }



// View all transactions
// Missing: NONE
// query{
//     transactions(start:0,end:10)
//     {
//       hash,
//       block,
//       from,
//       to,
//       value,
//       transaction_time,
//       functionType,
//       unix_timestamp,
//       gas,
//       gas_price
//     }
// }



// View a single transaction
// Missing:Interacted With (To), ERC-20 Tokens Transferred
// Gas Limit & Usage by Txn, Gas Fees, Burnt & Txn Savings Fees

// query{
//     transaction(hash:"0x1459ffa6614a64d60a35d13a31748bb8a083e89de4fdcde36a3e12a06e08f031")
//     {
//       hash,
//       block,
//       from,
//       to,
//       value,
//       transaction_time,
//       transaction_status,
//       functionType,
//       unix_timestamp,
//       Status,
//       State,
//       nonce,
//       type,
//       node_id,
//       gas,
//       gas_price,
//       input
//     }
// }