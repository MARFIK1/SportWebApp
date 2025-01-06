import { NextResponse } from "next/server";
import pool from "@/app/util/helpers/database";

export async function POST(req: Request) {
    try {
        const { nickname } = await req.json();
        const userId = req.headers.get("cookie")?.split("; ").find((c) => c.startsWith("user="))?.split("=")[1];
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!nickname) return NextResponse.json({ error: "Nickname is required" }, { status: 400 });

        const nicknameCheck = await pool.query("SELECT id FROM users WHERE nickname = $1", [nickname]);
        if (nicknameCheck?.rowCount && nicknameCheck.rowCount > 0) {
            return NextResponse.json({ error: "Nickname already taken" }, { status: 400 });
        }

        await pool.query("UPDATE users SET nickname = $1 WHERE id = $2", [nickname, userId]);
        return NextResponse.json({ message: "Nickname updated" });
    }
    catch (error) {
        console.error("Error updating nickname:", error);
        return NextResponse.json({ error: "Error updating nickname" }, { status: 500 });
    }
}