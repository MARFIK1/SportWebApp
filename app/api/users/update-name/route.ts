import { NextResponse } from "next/server";

import pool from "@/app/util/helpers/database";

export async function POST(req: Request) {
    try {
        const { first_name, last_name } = await req.json();
        const userId = req.headers
            .get("cookie")
            ?.split("; ")
            .find((c) => c.startsWith("user="))
            ?.split("=")[1];

        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const result = await pool.query(
            `UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3 RETURNING id, first_name, last_name`,
            [first_name || null, last_name || null, userId]
        )

        if (result.rowCount === 0) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json(result.rows[0]);
    }
    catch (error) {
        console.error("Error updating name:", error);
        return NextResponse.json({ error: "Failed to update name" }, { status: 500 });
    }
}