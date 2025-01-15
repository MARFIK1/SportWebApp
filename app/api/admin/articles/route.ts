import { NextResponse } from "next/server";

import pool from "@/app/util/helpers/database";

export async function GET() {
    try {
        const result = await pool.query(`
            SELECT 
                articles.id,
                articles.title,
                articles.content,
                articles.status,
                articles.created_at,
                articles.updated_at,
                users.nickname AS author,
                COUNT(comments.id) AS comment_count
            FROM articles
            LEFT JOIN users ON articles.user_id = users.id -- Użycie user_id zamiast author_id
            LEFT JOIN comments ON articles.id = comments.article_id
            GROUP BY articles.id, users.nickname
            ORDER BY articles.created_at DESC
        `)

        return NextResponse.json({ articles: result.rows });
    }
    catch (error) {
        console.error("Error fetching articles:", error);
        return NextResponse.json({ error: "Error fetching articles" }, { status: 500 });
    }
}