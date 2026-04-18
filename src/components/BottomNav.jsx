import { Link, useLocation } from "react-router-dom";

export default function BottomNav() {
  const location = useLocation();

  const navItems = [
    { name: "Scores", path: "/", icon: "⚽" },
    { name: "My Squad", path: "/squad", icon: "👕" },
    { name: "League", path: "/league", icon: "🏆" },
    { name: "Live", path: "/live", icon: "⚡" },
    { name: "Market", path: "/market", icon: "🛒" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-safe">
      <div className="w-full max-w-md bg-[#161616]/90 backdrop-blur-xl border-t border-white/5 flex justify-around items-center px-2 py-3">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              className={`flex flex-col items-center justify-center w-16 transition-all duration-300 ${
                isActive ? "text-white scale-110" : "text-text-tertiary hover:text-white/70"
              }`}
            >
              <span className={`text-xl mb-1 ${isActive ? "drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" : ""}`}>
                {item.icon}
              </span>
              <span className="text-[8px] uppercase tracking-[0.15em] font-black">
                {item.name}
              </span>
              {isActive && (
                <div className="absolute -bottom-1 w-1 h-1 bg-white rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
