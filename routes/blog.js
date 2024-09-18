const express = require("express");
const router = express.Router();

// Fetch settings from a simple configuration or database (for demonstration, using a global variable)
let blogTitle = "My Blog Title"; // Example blog title
let authorName = "Author Name"; // Example author name

// Redirect /blog/ to /blog/reader-home
router.get("/", (req, res) => {
    res.redirect("/blog/reader-home");
});

// Function to fetch published articles with optional tag filtering
function fetchPublishedArticles(tag, callback) {
    let sql = `
        SELECT articles.*, GROUP_CONCAT(tags.name) AS tags FROM articles 
        LEFT JOIN article_tags ON articles.article_id = article_tags.article_id 
        LEFT JOIN tags ON article_tags.tag_id = tags.tag_id 
        WHERE articles.published = 1 
        GROUP BY articles.article_id 
        ORDER BY articles.created_at DESC
    `;
    let params = [];

    if (tag) {
        sql = `
            SELECT articles.*, GROUP_CONCAT(tags.name) AS tags FROM articles
            LEFT JOIN article_tags ON articles.article_id = article_tags.article_id
            LEFT JOIN tags ON article_tags.tag_id = tags.tag_id
            WHERE tags.name = ? AND articles.published = 1
            GROUP BY articles.article_id
            ORDER BY articles.created_at DESC
        `;
        params = [tag];
    }

    global.db.all(sql, params, (err, rows) => {
        if (err) {
            callback(err, null);
        } else {
            rows.forEach((article) => {
                article.tags = article.tags ? article.tags.split(",") : [];
            });
            callback(null, rows);
        }
    });
}

// Fetch published articles for the reader home page
router.get("/reader-home", (req, res) => {
    fetchPublishedArticles(req.query.tag, (err, articles) => {
        if (err) {
            res.status(500).send(err.message);
        } else {
            res.render("reader-home.ejs", {
                articles: articles,
                blogTitle: blogTitle,
                authorName: authorName,
                title: "Reader Home",
                header: "Published Articles",
                currentRoute: "/blog/reader-home",
                tag: req.query.tag || "",
            });
        }
    });
});

// Fetch all articles and categorize them as published or draft for the author home page
router.get("/author-home", (req, res) => {
    global.db.all("SELECT * FROM articles", (err, rows) => {
        if (err) {
            res.status(500).send(err.message);
        } else {
            const publishedArticles = rows.filter((article) => article.published === 1);
            const draftArticles = rows.filter((article) => article.published === 0);
            res.render("author-home.ejs", {
                blogTitle: blogTitle,
                authorName: authorName,
                publishedArticles: publishedArticles,
                draftArticles: draftArticles,
                title: "Author Home",
                header: "Your Articles",
                currentRoute: "/blog/author-home",
            });
        }
    });
});

// Route for creating a new draft
router.post("/create-draft", (req, res) => {
    global.db.run(
        "INSERT INTO articles (title, created_at, updated_at) VALUES (?, datetime('now'), datetime('now'))",
        ["New Draft"],
        function (err) {
            if (err) {
                res.status(500).send(err.message);
            } else {
                res.redirect(`/blog/edit-article/${this.lastID}`);
            }
        }
    );
});

// Route for deleting an article
router.post("/delete-article/:id", (req, res) => {
    const articleId = req.params.id;
    global.db.run("DELETE FROM articles WHERE article_id = ?", [articleId], function (err) {
        if (err) {
            res.status(500).send(err.message);
        } else {
            res.redirect("/blog/author-home");
        }
    });
});

// Route for publishing an article
router.post("/publish-article/:id", (req, res) => {
    const articleId = req.params.id;
    global.db.run(
        "UPDATE articles SET published = 1, updated_at = CURRENT_TIMESTAMP WHERE article_id = ?",
        [articleId],
        function (err) {
            if (err) {
                res.status(500).send(err.message);
            } else {
                res.redirect(`/blog/author-home`);
            }
        }
    );
});

// Route for editing an article
router.get("/edit-article/:id", (req, res) => {
    const articleId = req.params.id;
    global.db.get("SELECT * FROM articles WHERE article_id = ?", [articleId], (err, article) => {
        if (err) {
            res.status(500).send(err.message);
        } else if (!article) {
            res.status(404).send("Article not found");
        } else {
            global.db.all(
                "SELECT name FROM tags JOIN article_tags ON tags.tag_id = article_tags.tag_id WHERE article_tags.article_id = ?",
                [articleId],
                (err, tags) => {
                    if (err) {
                        res.status(500).send(err.message);
                    } else {
                        res.render("edit-article.ejs", {
                            article: article,
                            tags: tags.map((tag) => tag.name).join(", "),
                            title: "Edit Article",
                            header: "Edit Your Article",
                            currentRoute: "/blog/edit-article",
                        });
                    }
                }
            );
        }
    });
});

// Route for updating an article
router.post("/update-article/:id", (req, res) => {
    const articleId = req.params.id;
    const { title, content, tags } = req.body;

    global.db.run(
        "UPDATE articles SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE article_id = ?",
        [title, content, articleId],
        function (err) {
            if (err) {
                res.status(500).send(err.message);
            } else {
                const tagList = tags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter((tag) => tag);
                global.db.run("DELETE FROM article_tags WHERE article_id = ?", [articleId], (err) => {
                    if (err) {
                        res.status(500).send(err.message);
                    } else {
                        tagList.forEach((tag) => {
                            global.db.run("INSERT OR IGNORE INTO tags (name) VALUES (?)", [tag], function (err) {
                                if (err) {
                                    res.status(500).send(err.message);
                                } else {
                                    const tagId = this.lastID;
                                    global.db.run("INSERT INTO article_tags (article_id, tag_id) VALUES (?, ?)", [
                                        articleId,
                                        tagId,
                                    ]);
                                }
                            });
                        });
                        res.redirect("/blog/author-home"); // Redirect to author home page
                    }
                });
            }
        }
    );
});

// Route for creating a new article or draft
router.get("/create-article", (req, res) => {
    res.render("create-article.ejs", {
        title: "Create New Article",
        currentRoute: "/blog/create-article",
    });
});

router.post("/create-article", (req, res) => {
    const { title, content, tags, action } = req.body;
    const published = action === "publish" ? 1 : 0;

    global.db.run(
        "INSERT INTO articles (title, content, created_at, updated_at, published) VALUES (?, ?, datetime('now'), datetime('now'), ?)",
        [title, content, published],
        function (err) {
            if (err) {
                res.status(500).send(err.message);
            } else {
                const articleId = this.lastID;
                const tagList = tags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter((tag) => tag);
                tagList.forEach((tag) => {
                    global.db.run("INSERT OR IGNORE INTO tags (name) VALUES (?)", [tag], function (err) {
                        if (err) {
                            res.status(500).send(err.message);
                        } else {
                            const tagId = this.lastID;
                            global.db.run("INSERT INTO article_tags (article_id, tag_id) VALUES (?, ?)", [
                                articleId,
                                tagId,
                            ]);
                        }
                    });
                });
                res.redirect("/blog/author-home");
            }
        }
    );
});

// Settings Page
router.get("/settings", (req, res) => {
    // Fetch current settings (you can add logic to fetch settings from the database)
    res.render("settings.ejs", {
        title: "Settings",
        header: "Edit Settings",
        blogTitle: blogTitle, // Example data, replace with actual data if needed
        authorName: authorName, // Example data, replace with actual data if needed
        currentRoute: "/blog/settings",
    });
});

// Route for updating settings
router.post("/update-settings", (req, res) => {
    const { blogTitle: newBlogTitle, authorName: newAuthorName } = req.body;
    blogTitle = newBlogTitle;
    authorName = newAuthorName;
    res.redirect("/blog/author-home");
});

// Adding comments
router.post("/add-comment/:id", (req, res) => {
    const articleId = req.params.id;
    const commenterName = req.body.commenter_name;
    const content = req.body.content;

    global.db.run(
        "INSERT INTO comments (content, commenter_name, article_id) VALUES (?, ?, ?)",
        [content, commenterName, articleId],
        function (err) {
            if (err) {
                res.status(500).send(err.message);
            } else {
                res.redirect(`/blog/article/${articleId}`);
            }
        }
    );
});

function renderArticlePage(articleId, res) {
    global.db.get(
        "SELECT articles.*, GROUP_CONCAT(tags.name) AS tags FROM articles LEFT JOIN article_tags ON articles.article_id = article_tags.article_id LEFT JOIN tags ON article_tags.tag_id = tags.tag_id WHERE articles.article_id = ?",
        [articleId],
        (err, article) => {
            if (err) {
                res.status(500).send(err.message);
            } else if (!article) {
                res.status(404).send("Article not found");
            } else {
                global.db.all("SELECT * FROM comments WHERE article_id = ?", [articleId], (err, comments) => {
                    if (err) {
                        res.status(500).send(err.message);
                    } else {
                        global.db.get(
                            "SELECT COUNT(*) AS likes FROM likes WHERE article_id = ?",
                            [articleId],
                            (err, result) => {
                                if (err) {
                                    res.status(500).send(err.message);
                                } else {
                                    article.tags = article.tags ? article.tags.split(",") : [];
                                    res.render("article.ejs", {
                                        article: article,
                                        comments: comments,
                                        likes: result.likes,
                                        title: article.title,
                                        header: article.title,
                                        currentRoute: "/blog/article",
                                    });
                                }
                            }
                        );
                    }
                });
            }
        }
    );
}

// Route for viewing an individual article
router.get("/article/:id", (req, res) => {
    const articleId = req.params.id;
    // Increment views separately from retrieving the article
    global.db.run("UPDATE articles SET views = views + 1 WHERE article_id = ?", [articleId], function (err) {
        if (err) {
            res.status(500).send(err.message);
        } else {
            renderArticlePage(articleId, res);
        }
    });
});

// Route for liking an article
router.post("/like-article/:id", (req, res) => {
    const articleId = req.params.id;

    global.db.run("INSERT INTO likes (article_id) VALUES (?)", [articleId], function (err) {
        if (err) {
            res.status(500).json({ success: false, message: err.message });
        } else {
            // Update likes without affecting views
            global.db.run("UPDATE articles SET likes = likes + 1 WHERE article_id = ?", [articleId], function (err) {
                if (err) {
                    res.status(500).json({ success: false, message: err.message });
                } else {
                    // Get the updated number of likes
                    global.db.get("SELECT likes FROM articles WHERE article_id = ?", [articleId], function (err, row) {
                        if (err) {
                            res.status(500).json({ success: false, message: err.message });
                        } else {
                            res.json({ success: true, likes: row.likes });
                        }
                    });
                }
            });
        }
    });
});

module.exports = router;
