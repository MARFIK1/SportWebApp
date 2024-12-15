"use client";

interface PageProps {
    menuItems: string[],
    activeTab: number,
    onTabClick: (index: number) => void
}

export default function LeagueMenu({ menuItems, activeTab, onTabClick } : PageProps) {
    return (
        <div className="flex flex-col h-full p-4 gap-2 text-neutral-100 bg-gray-800 z-50">
            <div className="flex flex-col justify-center items-center text-lg p-2 font-bold">
                Leagues
            </div>
            {
                menuItems.map((item, index) => (
                    <button
                        key={index}
                        className={`w-full py-2 px-4 rounded hover:bg-blue-800/50 ${index === activeTab ? "bg-gray-700" : ""}`}
                        onClick={() => onTabClick(index)}
                    >
                        {item}
                    </button>
                ))
            }
        </div>
    )
}