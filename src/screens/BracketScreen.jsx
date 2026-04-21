import { useNavigate } from 'react-router-dom';


export default function BracketScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bg text-white">
        {/* Header */}
        <div className="bg-surface border-b border-border px-5 py-3 flex items-center gap-3 sticky top-0 z-20">
          <button onClick={() => navigate(-1)} className="fz-label text-text-tertiary hover:text-cyan transition-colors">← Back</button>
          <div>
            <div className="fz-label text-text-tertiary">Mini Game</div>
            <h1 className="fz-display text-[22px] text-white leading-tight">BRACKET CHALLENGE</h1>
          </div>
        </div>
        
        <div className="p-6">
           <div className="text-center mb-8">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#E0A800]">World Cup 2026</div>
              <div className="text-2xl font-bold mt-1 tracking-tight">Knockout Stage</div>
              <p className="text-xs text-[#9E9E9E] mt-2 leading-relaxed">
                Predict the tournament tree. Gain points for every correct team advancement.
              </p>
           </div>
           
           {/* Visual Bracket Tree */}
           <div className="flex justify-between items-center relative py-10 overflow-x-auto no-scrollbar">
              
              {/* Semi Finals */}
              <div className="flex flex-col gap-12 z-10 w-2/5">
                 {/* Match 1 */}
                 <div className="flex flex-col gap-0 border border-[#2A2A2A] rounded overflow-hidden shadow-lg relative">
                    <div className="absolute top-1/2 -right-4 -translate-y-1/2 w-4 h-[2px] bg-[#2A2A2A]" />
                    <div className="bg-[#1A1A1A] px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-[#2A2A2A] active:bg-[#333]">
                      <span className="font-bold text-sm">BRA</span>
                      <span className="text-[10px] text-positive font-black">✓</span>
                    </div>
                    <div className="bg-[#111111] px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-[#2A2A2A] border-t border-[#2A2A2A]">
                      <span className="font-bold text-sm text-[#9E9E9E]">KOR</span>
                    </div>
                 </div>

                 {/* Match 2 */}
                 <div className="flex flex-col gap-0 border border-[#2A2A2A] rounded overflow-hidden shadow-lg mt-8 relative">
                    <div className="absolute top-1/2 -right-4 -translate-y-1/2 w-4 h-[2px] bg-[#2A2A2A]" />
                    <div className="bg-[#1A1A1A] px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-[#2A2A2A]">
                      <span className="font-bold text-sm">FRA</span>
                    </div>
                    <div className="bg-[#111111] px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-[#2A2A2A] border-t border-[#2A2A2A]">
                      <span className="font-bold text-sm text-[#9E9E9E]">ENG</span>
                    </div>
                 </div>
                 
                 {/* Connectors to Finals */}
                 <div className="absolute top-[80px] left-[40%] w-[15%] h-[120px] border-r-2 border-t-2 border-b-2 border-[#2A2A2A] rounded-r-lg z-0" />
                 <div className="absolute top-[140px] left-[55%] w-[10%] h-[2px] bg-[#2A2A2A] z-0" />
              </div>

              {/* Finals */}
              <div className="flex flex-col justify-center z-10 w-[45%]">
                 <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#E0A800] text-center mb-2 animate-pulse">Finals</div>
                 <div className="flex flex-col gap-0 border-2 border-[#E0A800]/50 rounded overflow-hidden shadow-[0_0_15px_rgba(224,168,0,0.2)]">
                    <div className="bg-[#1A1A1A] px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#2A2A2A]">
                      <span className="font-black text-[15px] text-[#E0A800]">BRA</span>
                    </div>
                    <div className="bg-[#111111] px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#2A2A2A] border-t border-[#2A2A2A]">
                      <span className="font-bold text-sm text-[#9E9E9E]">?</span>
                    </div>
                 </div>
              </div>
           </div>
           
           <div className="mt-8 bg-[#111] border border-[#2A2A2A] rounded flex flex-col p-4 items-center">
             <div className="w-12 h-12 bg-[#1A1A1A] rounded-full border border-white/5 flex items-center justify-center text-xl mb-3">
               🏆
             </div>
             <div className="text-[11px] font-bold text-text-tertiary uppercase tracking-widest text-center">Champion Prediction</div>
             <div className="text-[18px] font-black text-white mt-1">Brazil</div>
             <button className="mt-4 w-full bg-[#E0A800] text-[#1a1100] font-black uppercase tracking-widest text-[12px] py-3 rounded-sm active:scale-95 transition-transform">
               Save Bracket
             </button>
           </div>
        </div>

    </div>
  );
}
