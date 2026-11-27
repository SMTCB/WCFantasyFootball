// Bets pay either points or transfer budget (bet_instances.reward_type). The two
// are different units, so they are totalled and shown separately.

export function sumBetRewards(entries) {
  return entries.reduce((totals, { type, amount }) => {
    const key = type === 'budget' ? 'budget' : 'points';
    totals[key] += Number(amount) || 0;
    return totals;
  }, { points: 0, budget: 0 });
}

export const formatBetPoints = (points) => `+${points}`;

export const formatBetBudget = (budget) => `+€${budget}M`;

export const formatBetReward = (type, amount) =>
  type === 'budget' ? formatBetBudget(amount) : `${formatBetPoints(amount)} pts`;
