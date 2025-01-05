import { NextResponse } from "next/server";

import pool from "@/app/util/helpers/database";

export async function GET() {
    try {
        const result = await pool.query("SELECT * FROM articles ORDER BY created_at DESC");
        return NextResponse.json({ articles: result.rows });
    }
    catch (error) {
        console.error("Error fetching articles:", error);
        return NextResponse.json({ error: "Error fetching articles" }, { status: 500 });
    }
}