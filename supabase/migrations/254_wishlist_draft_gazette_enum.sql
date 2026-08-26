-- Migration 254: add wishlist_draft_report to gazette_entry_type enum
--
-- The new run-wishlist-draft / _shared/wishlistDraft.ts orchestration writes
-- entry_type='wishlist_draft_report' after each round's allocation. Same
-- idempotent ADD VALUE pattern as migration 153 (trade_result).

ALTER TYPE gazette_entry_type ADD VALUE IF NOT EXISTS 'wishlist_draft_report';
