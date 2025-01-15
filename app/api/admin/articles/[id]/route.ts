import { NextResponse } from "next/server";

import pool from "@/app/util/helpers/database";

export async function DELETE(req: Request, { params } : { params: { id: string } }) {
    try {
        const { id } = params;
        await pool.query("DELETE FROM comments WHERE article_id = $1", [id]);
        const result = await pool.query("DELETE FROM articles WHERE id = $1 RETURNING id", [id]);
        if (result.rowCount === 0) {
            return NextResponse.json({ error: "Article not found" }, { status: 404 });
        }

        return NextResponse.json({ message: "Article and related comments deleted successfully", id });
    }
    catch (error) {
        console.error("Error deleting article:", error);
        return NextResponse.json({ error: "Failed to delete article" }, { status: 500 });
    }
}