"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

import { useUser } from "@/app/util/UserContext";
import { Team, Player } from "@/types";
import SearchBarForm from "./SearchBarForm";

export default function Navbar({ teamsData, playersData } : { teamsData: Team[], playersData: Player[] }) {
    const { user, isLoading, logout } = useUser();
    const router = useRouter();
    const pathname = usePathname();
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const handleProfileClick = () => {
        router.push("/profile");
        setDropdownOpen(false);
    }

    const handleLogoutClick = async () => {
        await logout();
        if (pathname === "/profile") {
            router.push("/user/login");
        }
        setDropdownOpen(false);
    }

    const handleBlogClick = () => {
        router.push("/blog");
    }

    return (
        <div className="flex justify-between items-center w-full">
            <div className="flex items-center">
                <a
                    href="/"
                    className="flex items-center"
                >
                    <img
                        src="/logo.png"
                        alt="logo"
                        className="w-24 object-cover rounded-full"
                    />
                </a>
            </div>
            <div className="flex-1 mx-4">
                <SearchBarForm
                    teamsData={teamsData}
                    playersData={playersData}
                />
            </div>
            <div className="relative flex items-center space-x-4">
                <button
                    onClick={handleBlogClick}
                    className="text-white font-bold hover:text-gray-400"
                >
                    Blog
                </button>
                {
                    isLoading ? (
                        <div className="flex items-center justify-center w-10 h-10">
                            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-blue-500 border-solid"></div>
                        </div>
                    ) : user ? (
                        <div
                            className="flex items-center cursor-pointer relative"
                            onClick={() => setDropdownOpen((prev) => !prev)}
                        >
                            <img
                                src={user.profile_picture || "/default-avatar.png"}
                                alt="Avatar"
                                className="w-10 h-10 rounded-full"
                            />
                        </div>
                    ) : (
                        <button
                            onClick={() => router.push("/user/login")}
                            className="px-4 py-2 bg-blue-500 text-white rounded-lg"
                        >
                            Log in
                        </button>
                    )
                }
                {
                    dropdownOpen && (
                        <div
                            className="absolute right-0 top-full mt-2 w-48 bg-white border rounded-lg shadow-lg z-10"
                        >
                            <button
                                onClick={handleProfileClick}
                                className="block px-4 py-2 text-left text-gray-700 hover:bg-gray-100 w-full"
                            >
                                Profile
                            </button>
                            <button
                                onClick={handleLogoutClick}
                                className="block px-4 py-2 text-left text-gray-700 hover:bg-gray-100 w-full"
                            >
                                Logout
                            </button>
                        </div>
                    )
                }
            </div>
        </div>
    )
}