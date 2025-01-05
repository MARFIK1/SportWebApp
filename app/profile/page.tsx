"use client";
import { useRouter } from "next/navigation";

import { useUser } from "@/app/util/UserContext";

export default function ProfilePage() {
    const { user, isLoading } = useUser();
    const router = useRouter();

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-blue-500"></div>
            </div>
        )
    }

    if (!user) {
        router.replace("/user/login");
        return null;
    }

    return (
        <div className="max-w-3xl mx-auto mt-10">
            <h1 className="text-3xl font-bold">
                Hello, {user.nickname}!
            </h1>
            <p>
                Welcome to your profile page.
            </p>
        </div>
    )
}