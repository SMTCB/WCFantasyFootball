import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useAuditLog(leagueId) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    actionType: null,
    userId: null,
    daysBack: 30,
  });

  const fetchAuditLogs = useCallback(async () => {
    if (!leagueId) {
      setLogs([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase.rpc('get_audit_logs', {
        p_league_id: leagueId,
        p_limit: 500,
        p_action_type: filters.actionType,
        p_user_id: filters.userId,
        p_days_back: filters.daysBack,
      });

      if (err) {
        // Permission error or RPC failure
        if (err.message.includes('commissioners')) {
          setError('Only commissioners can view audit logs');
        } else {
          setError(err.message || 'Failed to load audit logs');
        }
        setLogs([]);
      } else {
        setLogs(data || []);
      }
    } catch (err) {
      setError(err.message || 'Error loading audit logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [leagueId, filters]);

  // Fetch logs when league or filters change
  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  // Set up realtime subscription for new logs
  useEffect(() => {
    if (!leagueId) return;

    const channel = supabase
      .channel(`audit_logs:${leagueId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_logs',
          filter: `league_id=eq.${leagueId}`,
        },
        (payload) => {
          // Add new log to the top of the list
          setLogs((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leagueId]);

  const updateFilters = (newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const exportLogs = async () => {
    try {
      const { data, error: err } = await supabase.rpc(
        'export_audit_logs_csv',
        {
          p_league_id: leagueId,
          p_days_back: filters.daysBack,
        }
      );

      if (err) throw err;

      // Trigger download
      const element = document.createElement('a');
      element.setAttribute(
        'href',
        'data:text/plain;charset=utf-8,' + encodeURIComponent(data)
      );
      element.setAttribute('download', `audit_logs_${leagueId}.csv`);
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    } catch (err) {
      setError('Failed to export logs: ' + (err.message || 'Unknown error'));
    }
  };

  const getActionLabel = (actionType, actionSubtype) => {
    const labels = {
      transfer: {
        player_buy: '🛒 Player Bought',
        player_sell: '💰 Player Sold',
      },
      bid: {
        auction_created: '🔨 Auction Listed',
        auction_bid_placed: '🤝 Bid Placed',
        auction_won: '🏆 Auction Won',
        auction_closed: '❌ Auction Closed',
      },
      bet: {
        bet_created: '🎲 Bet Created',
        bet_submitted: '✅ Answer Submitted',
        bet_resolved: '📊 Bet Resolved',
      },
    };

    return (
      labels[actionType]?.[actionSubtype] ||
      `${actionType} - ${actionSubtype}`
    );
  };

  return {
    logs,
    loading,
    error,
    filters,
    updateFilters,
    refetch: fetchAuditLogs,
    exportLogs,
    getActionLabel,
  };
}
