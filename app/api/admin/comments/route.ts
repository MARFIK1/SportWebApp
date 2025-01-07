import { NextResponse } from "next/server";

import pool from "@/app/util/helpers/database";

export async function GET() {
    try {
        const result = await pool.query(`
            SELECT 
                comments.id, 
                comments.content, 
                comments.article_id, 
                comments.created_at, 
                users.nickname AS author, 
                articles.title AS article_title 
            FROM comments 
            JOIN users ON comments.user_id = users.id 
            LEFT JOIN articles ON comments.article_id = articles.id 
            ORDER BY comments.created_at DESC
        `)
        
        return NextResponse.json({ comments: result.rows });
    }
    catch (error) {
        console.error("Error fetching comments:", error);
        return NextResponse.json({ error: "Error fetching comments" }, { status: 500 });
    }
}