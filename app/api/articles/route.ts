import { NextResponse } from "next/server";

import pool from "@/app/util/helpers/database";

export async function GET() {
    try {
        const result = await pool.query(`
            SELECT articles.*, 
                users.nickname AS author, 
                users.profile_picture AS author_picture,
                (SELECT COUNT(*) FROM comments WHERE comments.article_id = articles.id) AS comment_count
            FROM articles
            JOIN users ON articles.user_id = users.id
            WHERE status = 'approved'
            ORDER BY created_at DESC
        `)

        return NextResponse.json({ articles: result.rows });
    }
    catch (error) {
        console.error("Error fetching articles:", error);
        return NextResponse.json({ error: "Error fetching articles" }, { status: 500 });
    }
}