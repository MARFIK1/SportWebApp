import { NextResponse } from "next/server";

import pool from "@/app/util/helpers/database";

export async function GET(req: Request) {
    try {
        const cookieHeader = req.headers.get("cookie");
        const userCookie = cookieHeader?.split("; ").find((c) => c.startsWith("user="));
        const userId = userCookie?.split("=")[1];

        if (!userId) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        const userQuery = await pool.query(
            "SELECT id, nickname, email, profile_picture, role FROM users WHERE id = $1",
            [userId]
        )
        const user = userQuery.rows[0];

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json({ user });
    }
    catch (error) {
        console.error("Error fetching user:", error);
        return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
    }
}