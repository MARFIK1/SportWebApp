"use client";
import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { User } from "@/types";

interface UserContextProps {
    user: User | null;
    isLoading: boolean;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    logout: () => void;
}

const UserContext = createContext<UserContextProps | undefined>(undefined);

export const UserProvider = ({ children } : { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const logout = async () => {
        setUser(null);
        await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include"
        })
        document.cookie = "user=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    }

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch("/api/auth/me", { credentials: "include" });
                if (res.ok) {
                    const data = await res.json();
                    setUser(data.user);
                }
                else {
                    setUser(null);
                }
            }
            catch (error) {
                console.error("Error fetching user:", error);
                setUser(null);
            }
            finally {
                setIsLoading(false);
            }
        }
        fetchUser();
    }, [])
    
    return (
        <UserContext.Provider value={{ user, isLoading, setUser, logout }}>
            {children}
        </UserContext.Provider>
    )
}

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error("useUser must be used within a UserProvider");
    }
    return context;
}