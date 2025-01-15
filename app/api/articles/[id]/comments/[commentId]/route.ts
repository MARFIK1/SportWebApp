import { NextResponse } from "next/server";

import pool from "@/app/util/helpers/database";

export async function PUT(req: Request, { params } : { params: { id: string; commentId: string } }) {
    try {
        const { id: articleId, commentId } = params;
        const { content } = await req.json();
        if (!content || !articleId) {
            return NextResponse.json({ error: "ArticleId and content are required" }, { status: 400 });
        }

        const result = await pool.query(
            `
            UPDATE comments 
            SET content = $1, updated_at = NOW() 
            WHERE id = $2 AND article_id = $3 
            RETURNING id, content, created_at, updated_at, user_id
            `,
            [content, commentId, articleId]
        )

        if (result.rowCount === 0) {
            return NextResponse.json({ error: "Comment not found" }, { status: 404 });
        }

        const updatedComment = result.rows[0];
        const userResult = await pool.query(
            `
            SELECT nickname AS author, profile_picture 
            FROM users 
            WHERE id = $1
            `,
            [updatedComment.user_id]
        )

        if (userResult.rowCount === 0) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json({
            comment: {
                ...updatedComment,
                author: userResult.rows[0].author,
                profile_picture: userResult.rows[0].profile_picture
            }
        })
    }
    catch (error) {
        console.error("Error updating comment:", error);
        return NextResponse.json({ error: "Failed to update comment" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params } : { params: { id: string; commentId: string } }) {
    try {
        const { id: articleId, commentId } = params;
        const result = await pool.query(
            "DELETE FROM comments WHERE id = $1 AND article_id = $2 RETURNING id",
            [commentId, articleId]
        )

        if (result.rowCount === 0) {
            return NextResponse.json({ error: "Comment not found" }, { status: 404 });
        }

        return NextResponse.json({ message: "Comment deleted successfully" }, { status: 200 });
    }
    catch (error) {
        console.error("Error deleting comment:", error);
        return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
    }
}