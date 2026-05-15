import { useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Returns a submit function that calls the submit_bet RPC.
 * Handles loading/error state; caller provides onSuccess callback.
 */
export function useBetSubmit() {
  const [submitting, setSubmitting] = useState(false);

  const submitBet = async (instanceId, squadId, answer, { onSuccess, onError } = {}) => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('submit_bet', {
        p_instance_id: instanceId,
        p_squad_id:    squadId,
        p_answer:      answer,
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'Submission failed.');

      onSuccess?.();
    } catch (err) {
      // Surface duplicate-submission constraint as a friendly message
      const msg = err.message ?? '';
      const isDuplicate = msg.includes('bet_submissions_unique_squad_bet') || msg.includes('duplicate');
      onError?.(isDuplicate ? 'You already submitted a pick for this bet.' : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return { submitBet, submitting };
}
