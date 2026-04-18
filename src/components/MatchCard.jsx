import { Link } from "react-router-dom";
import LiveDot from "./LiveDot";

function TeamCrest({ team, isRight = false }) {
  // Mock abstract crest using the team color and code
  return (
    <div
      className={`flex items-center gap-3 ${isRight ? "flex-row-reverse" : ""} flex-1 min-w-0`}
    >
      <div
        className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-black border border-white/20"
        style={{ backgroundColor: team.color }}
      ></div>
      <span className="font-medium uppercase text-sm truncate">
        {team.name}
      </span>
    </div>
  );
}

export default function MatchCard({ match }) {
  const isLive = match.status === "LIVE";
  const isFT = match.status === "FT";

  return (
    <div className="flex flex-col bg-surface border-b border-border active:bg-surface-elevated transition-colors">
      <div className="h-[72px] px-4 flex items-center justify-between relative">
        {/* Status indicator top right */}
        <div className="absolute top-2 right-4 flex items-center gap-1.5">
          {isLive && <LiveDot />}
          <span
            className={`text-[11px] font-medium ${isLive ? "text-live" : "text-text-tertiary"}`}
          >
            {match.minute || match.time}
          </span>
        </div>

        <TeamCrest team={match.homeTeam} />

        {/* Score Area */}
        <div className="flex-1 flex justify-center pt-2">
          {match.score ? (
            <div
              className={`flex gap-3 tabular-nums text-[28px] font-black tracking-tight ${isFT ? "text-text-secondary" : "text-text-primary"}`}
            >
              <span className="w-8 text-right">{match.score.home}</span>
              <span className="text-text-tertiary font-medium pb-1 flex items-center text-xl">
                -
              </span>
              <span className="w-8 text-left">{match.score.away}</span>
            </div>
          ) : (
            <div className="text-[15px] font-bold text-text-secondary pt-1">
              v
            </div>
          )}
        </div>

        <TeamCrest team={match.awayTeam} isRight />
      </div>

      {match.hasOwnedPlayer && (
        <div className="px-4 py-1.5 bg-surface-elevated/50 border-t border-border flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-text-secondary rounded-full" />
          <span className="text-xs text-text-secondary">
            {match.ownedPlayerMessage}
          </span>
        </div>
      )}
    </div>
  );
}
