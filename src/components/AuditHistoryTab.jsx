import React, { useState } from 'react';
import { useAuditLog } from '../hooks/useAuditLog';

export default function AuditHistoryTab({ leagueId, leagueMembers }) {
  const { logs, loading, error, filters, updateFilters, exportLogs, getActionLabel } =
    useAuditLog(leagueId);
  const [expandedLogId, setExpandedLogId] = useState(null);

  // Group members for filter dropdown
  const memberOptions = leagueMembers?.map((m) => ({
    id: m.user_id,
    name: m.username || 'Unknown User',
  })) || [];

  const actionTypeOptions = [
    { value: 'transfer', label: '🛒 Transfers' },
    { value: 'bid', label: '🔨 Auctions' },
    { value: 'bet', label: '🎲 Bets' },
  ];

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-GB', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (error && !logs.length) {
    return (
      <div className="p-6 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
        <p className="text-orange-800 dark:text-orange-100">
          <strong>⚠️ {error}</strong>
        </p>
        <p className="text-sm text-orange-600 dark:text-orange-300 mt-2">
          You must be a league commissioner to view this tab.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header with filters */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-ink-900 dark:text-white">
            📋 Audit History
          </h3>
          <button
            onClick={exportLogs}
            disabled={loading || logs.length === 0}
            className="ml-auto px-3 py-1 text-sm bg-gold-600 hover:bg-gold-700 disabled:bg-gray-400 text-white rounded-md transition"
            title="Download as CSV"
          >
            ⬇️ Export CSV
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {/* Action Type Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-ink-700 dark:text-ink-300">
              Type:
            </label>
            <select
              value={filters.actionType || ''}
              onChange={(e) =>
                updateFilters({ actionType: e.target.value || null })
              }
              className="px-2 py-1 text-sm border border-ink-300 dark:border-ink-600 rounded bg-white dark:bg-ink-800 text-ink-900 dark:text-white"
            >
              <option value="">All Actions</option>
              {actionTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* User Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-ink-700 dark:text-ink-300">
              User:
            </label>
            <select
              value={filters.userId || ''}
              onChange={(e) =>
                updateFilters({ userId: e.target.value || null })
              }
              className="px-2 py-1 text-sm border border-ink-300 dark:border-ink-600 rounded bg-white dark:bg-ink-800 text-ink-900 dark:text-white"
            >
              <option value="">All Users</option>
              {memberOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>

          {/* Days Back Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-ink-700 dark:text-ink-300">
              Period:
            </label>
            <select
              value={filters.daysBack}
              onChange={(e) =>
                updateFilters({ daysBack: parseInt(e.target.value) })
              }
              className="px-2 py-1 text-sm border border-ink-300 dark:border-ink-600 rounded bg-white dark:bg-ink-800 text-ink-900 dark:text-white"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center text-ink-600 dark:text-ink-400">
            <p>Loading audit logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-center text-ink-500 dark:text-ink-400">
            <p>No actions recorded in this period.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="border border-ink-200 dark:border-ink-700 rounded-lg p-4 bg-white dark:bg-ink-800 hover:bg-ink-50 dark:hover:bg-ink-700 transition cursor-pointer"
                onClick={() =>
                  setExpandedLogId(
                    expandedLogId === log.id ? null : log.id
                  )
                }
              >
                {/* Summary Row */}
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-ink-900 dark:text-white">
                        {getActionLabel(log.action_type, log.action_subtype)}
                      </span>
                      <span className="text-xs text-ink-500 dark:text-ink-400">
                        {formatDate(log.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-ink-700 dark:text-ink-300 mb-1">
                      <strong>{log.target_name}</strong>
                    </p>
                    <p className="text-xs text-ink-600 dark:text-ink-400">
                      {log.reason}
                    </p>
                  </div>
                  <span className="text-xl">
                    {expandedLogId === log.id ? '▼' : '▶'}
                  </span>
                </div>

                {/* Expanded Details */}
                {expandedLogId === log.id && (
                  <div className="mt-4 pt-4 border-t border-ink-200 dark:border-ink-700 space-y-2 text-sm">
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div>
                        <p className="font-medium text-ink-700 dark:text-ink-300">
                          Details:
                        </p>
                        <ul className="ml-4 mt-1 space-y-1 text-ink-600 dark:text-ink-400">
                          {Object.entries(log.metadata).map(([key, value]) => (
                            <li key={key}>
                              <span className="font-mono text-xs">
                                {key}:
                              </span>{' '}
                              {typeof value === 'object'
                                ? JSON.stringify(value)
                                : String(value)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {log.action_type === 'transfer' && log.metadata?.price && (
                      <div>
                        <p className="font-medium text-ink-700 dark:text-ink-300">
                          Price: £{log.metadata.price.toLocaleString()}
                        </p>
                      </div>
                    )}
                    {log.action_type === 'bid' && log.metadata?.final_price && (
                      <div>
                        <p className="font-medium text-ink-700 dark:text-ink-300">
                          Final Price: £{log.metadata.final_price.toLocaleString()}
                        </p>
                      </div>
                    )}
                    {log.action_type === 'bet' && log.metadata?.reward && (
                      <div>
                        <p className="font-medium text-ink-700 dark:text-ink-300">
                          Reward: {log.metadata.reward} pts
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-ink-500 dark:text-ink-500">
                      ID: {log.id}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
