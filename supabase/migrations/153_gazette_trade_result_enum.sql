-- Migration 153: add trade_result to gazette_entry_type enum
--
-- accept_trade_proposal (migration 150/152) writes entry_type='trade_result'
-- but the enum value was never registered. Fix: idempotent ADD VALUE.

ALTER TYPE gazette_entry_type ADD VALUE IF NOT EXISTS 'trade_result';
