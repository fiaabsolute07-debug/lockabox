-- The sign-in message's Issued At must be the one the server issued with the nonce.
alter table auth_nonces add column issued_at text;
