var moment = require('moment');
var sanitizeHtml = require('sanitize-html');
var notifier = require('./notifier.js');

const url = require('url');

sanitizeHtmlOptions = {
    allowedTags: ['em', 'strong', 'a', 'p', 'br', 'div', 'span'],
    allowedAttributes: {
        'a': ['href', 'data-*', 'target', 'rel']
    }
}

moment.updateLocale('en', {
    relativeTime: {
        future: "in %s",
        past: "%s ago",
        s: '1s',
        ss: '%ds',
        m: "1m",
        mm: "%dm",
        h: "1h",
        hh: "%dh",
        d: "1d",
        dd: "%dd",
        M: "1mon",
        MM: "%dmon",
        y: "1y",
        yy: "%dy"
    }
});

var sanitize = require('mongo-sanitize');
const sharp = require('sharp');
var shortid = require('shortid');
const fs = require('fs');
const request = require('request');

// APIs

var apiConfig = require('../config/apis.js');

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(apiConfig.sendgrid);

var imaggaOptions = {
    headers: {
        'Authorization': apiConfig.imagga
    }
};

module.exports = function (app) {
    //Old image uploading function. Didn't distinguish between public and private images. No longer used
    app.post("/api/image", isLoggedInOrRedirect, function (req, res) {
        if (req.files.image) {
            if (req.files.image.size <= 10485760) {
                let imageFormat = fileType(req.files.image.data);
                let imageUrl = shortid.generate();
                if (imageFormat.mime == "image/gif") {
                    if (req.files.image.size <= 5242880) {
                        var imageData = req.files.image.data;
                        console.log(imageUrl + '.gif');
                        fs.writeFile('./public/images/uploads/' + imageUrl + '.gif', imageData, 'base64', function (err) {
                            if (err) {
                                return console.log(err);
                            }
                            getTags('https://sweet.sh/images/uploads/' + imageUrl + '.gif')
                                .then((tags) => {
                                    if (tags.auto) {
                                        imageTags = tags.auto.join(", ");
                                    } else {
                                        imageTags = ""
                                    }
                                    res.setHeader('content-type', 'text/plain');
                                    res.end(JSON.stringify({
                                        url: imageUrl + '.gif',
                                        tags: imageTags
                                    }));
                                })
                                .catch(err => {
                                    console.error(err);
                                    imageTags = ""
                                    res.setHeader('content-type', 'text/plain');
                                    res.end(JSON.stringify({
                                        url: imageUrl + '.gif',
                                        tags: imageTags
                                    }));
                                })
                        })
                    } else {
                        res.setHeader('content-type', 'text/plain');
                        res.end(JSON.stringify({
                            error: "filesize"
                        }));
                    }
                } else if (imageFormat.mime == "image/jpeg" || imageFormat.mime == "image/png") {
                    sharp(req.files.image.data)
                        .resize({
                            width: 1200,
                            withoutEnlargement: true
                        })
                        .jpeg({
                            quality: 70
                        })
                        .toFile('./public/images/uploads/' + imageUrl + '.jpg')
                        .then(image => {
                            getTags('https://sweet.sh/images/uploads/' + imageUrl + '.jpg')
                                .then((tags) => {
                                    if (tags.auto) {
                                        imageTags = tags.auto.join(", ");
                                    } else {
                                        imageTags = ""
                                    }
                                    res.setHeader('content-type', 'text/plain');
                                    res.end(JSON.stringify({
                                        url: imageUrl + '.jpg',
                                        tags: imageTags
                                    }));
                                })
                                .catch(err => {
                                    console.error(err);
                                    imageTags = ""
                                    res.setHeader('content-type', 'text/plain');
                                    res.end(JSON.stringify({
                                        url: imageUrl + '.jpg',
                                        tags: imageTags
                                    }));
                                })
                        })
                        .catch(err => {
                            console.error(err);
                        });
                }
            } else {
                res.setHeader('content-type', 'text/plain');
                res.end(JSON.stringify({
                    error: "filesize"
                }));
            }
        }
    })

    //New image upload reciever.
    //Inputs: image data.
    //Outputs: if the image is under the max size for its file type (currently 5 MB for .gifs and 10 MB for .jpgs) it is saved (if it's a .gif),
    //or saved as a 1200 pixel wide jpg with compression level 85 otherwise. Saves to the temp folder; when a post or comment is actually completed,
    //it's moved to the image folder that post images are loaded from upon being displayed. Or isLoggedInOrRedirect redirects you
    app.post("/api/image/v2", isLoggedInOrRedirect, async function (req, res) {
        var imageQualitySettingsArray = {
            'standard': {
                resize: 1200,
                filetype: 'jpg',
                jpegQuality: 85
            },
            'high': {
                resize: 2048,
                filetype: 'png',
                jpegQuality: 95
            },
            'ridiculous': {
                resize: 4096,
                filetype: 'png',
                jpegQuality: 95
            }
        };
        var imageQualitySettings = imageQualitySettingsArray[req.user.settings.imageQuality];
        if (req.files.image) {
            if (req.files.image.size <= 10485760) {
                var sharpImage;
                var imageMeta;
                try {
                    sharpImage = sharp(req.files.image.data);
                    imageMeta = await sharpImage.metadata();
                } catch (err) {
                    console.log("image failed to be loaded by sharp for format determination");
                    res.setHeader('content-type', 'text/plain');
                    res.end(JSON.stringify({
                        error: "filetype"
                    }));
                    return;
                }
                var imageFormat = imageMeta.format;
                let imageUrl = shortid.generate();
                if (imageFormat == "gif") {
                    if (req.files.image.size <= 5242880) {
                        var imageData = req.files.image.data;
                        console.log(imageUrl + '.gif');
                        fs.writeFile('./cdn/images/temp/' + imageUrl + '.gif', imageData, 'base64', function (err) { //to temp
                            if (err) {
                                return console.log(err);
                            }
                            //WHAT IS THIS
                            // getTags('https://sweet.sh/images/uploads/' + imageUrl + '.gif')
                            // .then((tags) => {
                            //   if (tags.auto){
                            //     imageTags = tags.auto.join(", ");
                            //   }
                            //   else {
                            //     imageTags = ""
                            //   }
                            imageTags = ""
                            res.setHeader('content-type', 'text/plain');
                            res.end(JSON.stringify({
                                url: imageUrl + '.gif',
                                tags: imageTags
                            }));
                            //WHAT IS THIS
                            // })
                            // .catch(err => {
                            //   console.error(err);
                            //   imageTags = ""
                            //   res.setHeader('content-type', 'text/plain');
                            //   res.end(JSON.stringify({url: imageUrl + '.gif', tags: imageTags}));
                            // })
                        })
                    } else {
                        res.setHeader('content-type', 'text/plain');
                        res.end(JSON.stringify({
                            error: "filesize"
                        }));
                    }
                } else if (imageFormat == "jpeg" || imageFormat == "png") {
                    sharpImage = sharpImage.resize({
                            width: imageQualitySettings.resize,
                            withoutEnlargement: true
                        })
                        .rotate();
                    if (imageFormat == "png" && req.user.settings.imageQuality == "standard") {
                        sharpImage = sharpImage.flatten({
                            background: {
                                r: 255,
                                g: 255,
                                b: 255
                            }
                        });
                    }
                    if (imageFormat == "jpeg" || req.user.settings.imageQuality == "standard") {
                        sharpImage = sharpImage.jpeg({
                            quality: imageQualitySettings.jpegQuality
                        })
                    } else {
                        sharpImage = sharpImage.png();
                    }
                    sharpImage.toFile('./cdn/images/temp/' + imageUrl + '.' + imageFormat) //to temp
                        .then(image => {
                            imageTags = ""
                            res.setHeader('content-type', 'text/plain');
                            res.end(JSON.stringify({
                                url: imageUrl + '.' + imageFormat,
                                tags: imageTags
                            }));
                        })
                        .catch(err => {
                            console.error("could not temp save uploaded image:")
                            console.error(err);
                        });

                } else {
                    console.log("image not a gif or a png or a jpg according to sharp!");
                    res.setHeader('content-type', 'text/plain');
                    res.end(JSON.stringify({
                        error: "filetype"
                    }));
                    return;
                }
            } else {
                res.setHeader('content-type', 'text/plain');
                res.end(JSON.stringify({
                    error: "filesize"
                }));
            }
        }
    })

    //Responds to post requests that inform the server that a post that images were uploaded for will not be posted by deleting those images.
    //Inputs: image file name
    //Outputs: the image presumably in the temp folder with that filename is deleted
    app.post("/cleartempimage", isLoggedInOrErrorResponse, function (req, res) {
        if (req.body.imageURL != "" && !req.body.imageURL.includes("/")) {
            fs.unlink("./cdn/images/temp/" + req.body.imageURL, function (e) {
                if (e) {
                    console.log("could not delete image " + "./cdn/images/temp/" + req.body.imageURL);
                    console.log(e);
                }
            });
        }
    })

    //Responds to post requests that create a new post.
    //Input: in req.body: the post's privacy level, filenames for its images, descriptions for its images, the post body, and a communityid
    //if it's a community post.
    //Outputs: all that stuff is saved as a new post document (with the body of the post parsed to turn urls and tags and @s into links). Or, redirect
    //if not logged in.
    app.post("/createpost", isLoggedInOrRedirect, function (req, res) {

        newPostUrl = shortid.generate();
        let postCreationTime = new Date();
        var postPrivacy = req.body.postPrivacy;
        var postImages = JSON.parse(req.body.postImageURL).slice(0, 4); //in case someone sends us more with custom ajax request
        var postImageTags = [""]; //what
        var postImageDescriptions = JSON.parse(req.body.postImageDescription).slice(0, 4);
        var postImageQuality = req.user.settings.imageQuality;

        let parsedResult = helper.parseText(req.body.postContent, req.body.postContentWarnings);

        if (!(postImages || parsedResult)) { //in case someone tries to make a blank post with a custom ajax post request. storing blank posts = not to spec
            res.status(400).send('bad post op');
            return;
        }

        function savePost(linkPreviewEnabled, linkPreviewMetadata) {
            // if (linkPreviewEnabled) {
            //     linkPreview = {
            //         url: linkPreviewMetadata.url,
            //         domain: url.parse(linkPreviewMetadata.url).hostname,
            //         title: linkPreviewMetadata.title,
            //         description: linkPreviewMetadata.description,
            //         image: linkPreviewMetadata.image,
            //     }
            // } else {
            //     linkPreview = {};
            // }
            //non-community post
            if (!req.body.communityId) {
                var post = new Post({
                    type: 'original',
                    authorEmail: req.user.email,
                    author: req.user._id,
                    url: newPostUrl,
                    privacy: postPrivacy,
                    timestamp: postCreationTime,
                    lastUpdated: postCreationTime,
                    rawContent: sanitize(req.body.postContent),
                    parsedContent: parsedResult.text,
                    numberOfComments: 0,
                    mentions: parsedResult.mentions,
                    tags: parsedResult.tags,
                    contentWarnings: sanitize(sanitizeHtml(req.body.postContentWarnings, sanitizeHtmlOptions)),
                    imageVersion: 2,
                    images: postImages,
                    imageTags: postImageTags,
                    imageDescriptions: postImageDescriptions,
                    subscribedUsers: [req.user._id],
                    boostsV2: [{
                        booster: req.user._id,
                        timestamp: postCreationTime
                    }]
                    // linkPreview: linkPreview
                });

                // Parse images
                if (postImages) {
                    postImages.forEach(function (imageFileName) {
                        if (imageFileName) {
                            fs.renameSync("./cdn/images/temp/" + imageFileName, "./cdn/images/" + imageFileName, function (e) {
                                if (e) {
                                    console.log("could not move " + imageFileName + " out of temp");
                                    console.log(e);
                                }
                            }) //move images out of temp storage
                            sharp('./cdn/images/' + imageFileName).metadata().then(metadata => {
                                image = new Image({
                                    context: "user",
                                    filename: imageFileName,
                                    privacy: postPrivacy,
                                    user: req.user._id,
                                    quality: postImageQuality,
                                    height: metadata.height,
                                    width: metadata.width
                                })
                                image.save();
                            })
                        }
                    });
                }
                var newPostId = post._id;
                post.save()
                    .then(() => {
                        parsedResult.tags.forEach((tag) => {
                            Tag.findOneAndUpdate({
                                name: tag
                            }, {
                                "$push": {
                                    "posts": newPostId
                                },
                                "$set": {
                                    "lastUpdated": postCreationTime
                                }
                            }, {
                                upsert: true,
                                new: true
                            }, function (error, result) {
                                if (error) return
                            });
                        });
                        if (postPrivacy == "private") {
                            console.log("This post is private!")
                            // Make sure to only notify mentioned people if they are trusted
                            Relationship.find({
                                    from: req.user.email,
                                    value: "trust"
                                }, {
                                    'to': 1
                                })
                                .then((emails) => {
                                    let emailsArray = emails.map(({
                                        to
                                    }) => to)
                                    parsedResult.mentions.forEach(function (mention) {
                                        User.findOne({
                                                username: mention
                                            })
                                            .then((user) => {
                                                if (emailsArray.includes(user.email)) {
                                                    notifier.notify('user', 'mention', user._id, req.user._id, newPostId, '/' + req.user.username + '/' + newPostUrl, 'post')
                                                }
                                            })
                                    })
                                })
                                .catch((err) => {
                                    console.log("Error in profileData.")
                                    console.log(err);
                                });
                        } else if (postPrivacy == "public") {
                            console.log("This post is public!")
                            // This is a public post, notify everyone
                            parsedResult.mentions.forEach(function (mention) {
                                if (mention != req.user.username) { //don't get notified from mentioning yourself
                                    User.findOne({
                                            username: mention
                                        })
                                        .then((user) => {
                                            notifier.notify('user', 'mention', user._id, req.user._id, newPostId, '/' + req.user.username + '/' + newPostUrl, 'post')
                                        })
                                }
                            });
                        }
                        res.redirect('back');
                    })
                    .catch((err) => {
                        console.log("Database error: " + err)
                    });

                //community post
            } else {
                let communityId = req.body.communityId;

                const post = new Post({
                    type: 'community',
                    community: communityId,
                    authorEmail: req.user.email,
                    author: req.user._id,
                    url: newPostUrl,
                    privacy: 'public',
                    timestamp: postCreationTime,
                    lastUpdated: postCreationTime,
                    rawContent: sanitize(req.body.postContent),
                    parsedContent: parsedResult.text,
                    numberOfComments: 0,
                    mentions: parsedResult.mentions,
                    tags: parsedResult.tags,
                    contentWarnings: sanitize(req.body.postContentWarnings),
                    imageVersion: 2,
                    images: postImages,
                    imageTags: postImageTags,
                    imageDescriptions: postImageDescriptions,
                    subscribedUsers: [req.user._id],
                    boostsV2: [{
                        booster: req.user._id,
                        timestamp: postCreationTime
                    }],
                    // linkPreview: linkPreview
                });

                // Parse images
                if (postImages) {
                    postImages.forEach(function (imageFileName) {
                        fs.rename("./cdn/images/temp/" + imageFileName, "./cdn/images/" + imageFileName, function (e) {
                            if (e) {
                                console.log("could not move " + imageFileName + " out of temp");
                                console.log(e);
                            }
                        }) //move images out of temp storage
                        Community.findOne({
                                _id: communityId
                            })
                            .then(community => {
                                image = new Image({
                                    context: "community",
                                    filename: imageFileName,
                                    privacy: community.settings.visibility,
                                    user: req.user._id,
                                    community: communityId
                                })
                                image.save();
                            })
                    });
                }

                post.save()
                    .then(() => {
                        parsedResult.tags.forEach((tag) => {
                            Tag.findOneAndUpdate({
                                name: tag
                            }, {
                                "$push": {
                                    "posts": newPostId
                                }
                            }, {
                                upsert: true,
                                new: true
                            }, function (error, result) {
                                if (error) return
                            });
                        });
                        // Notify everyone mentioned that belongs to this community
                        parsedResult.mentions.forEach(function (mention) {
                            if (mention != req.user.username) { //don't get notified from mentioning yourself
                                User.findOne({
                                        username: mention,
                                        communities: {
                                            $in: [communityId]
                                        }
                                    })
                                    .then((user) => {
                                        notifier.notify('user', 'mention', user._id, req.user._id, newPostId, '/' + req.user.username + '/' + newPostUrl, 'post')
                                    })
                            }
                        });
                        Community.findOneAndUpdate({
                            _id: communityId
                        }, {
                            $set: {
                                lastUpdated: new Date()
                            }
                        }).then(community => {
                            console.log("Updated community!")
                        })
                        res.redirect('back');
                    })
                    .catch((err) => {
                        console.log("Database error: " + err)
                    });
            }
        }

        //get link preview for first link in content
        // contentURLMatch = parsedResult.text.match(/<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/);
        // if (contentURLMatch) {
        //     contentURL = contentURLMatch[2]
        //     got(contentURL)
        //     .then(({ body: html, url }) => {
        //         metascraper({ html, url })
        //             .then(metadata => {
        //                 savePost(true, metadata);
        //         })
        //     })
        // } else {
        //     savePost(false);
        // }
        savePost();
    });

    //Responds to requests that delete posts.
    //Inputs: id of post to delete (in req.params)
    //Outputs: delete each image, delete each tag, delete the boosted versions, delete each comment image, delete notifications it caused, delete the post document.
    app.post("/deletepost/:postid", isLoggedInOrRedirect, function (req, res) {
        Post.findOne({
                "_id": req.params.postid
            })
            .then((post) => {

                if (!post.author._id.equals(req.user._id)) {
                    res.status(400).send("you are not the owner of this post which you are attempting to delete. i know how you feel, but this is not allowed");
                    return;
                }

                // Delete images
                post.images.forEach((image) => {
                    if (post.imageVersion === 2) {
                        fs.unlink(global.appRoot + '/cdn/images/' + image, (err) => {
                            if (err) console.log("Image deletion error " + err)
                        })
                    } else {
                        fs.unlink(global.appRoot + '/public/images/uploads/' + image, (err) => {
                            if (err) console.log("Image deletion error " + err)
                        })
                    }
                    Image.deleteOne({
                        "filename": image
                    })
                })

                // Delete tags (does not currently fix tag last updated time)
                post.tags.forEach((tag) => {
                    Tag.findOneAndUpdate({
                            name: tag
                        }, {
                            $pull: {
                                posts: req.params.postid
                            }
                        })
                        .then((tag) => {
                            console.log("Deleted tag: " + tag)
                        })
                        .catch((err) => {
                            console.log("Database error: " + err)
                        })
                })

                // Delete boosts
                if (post.type == "original") {
                    post.boosts.forEach((boost) => {
                        Post.deleteOne({
                                "_id": boost
                            })
                            .then((boost) => {
                                console.log("Deleted boost: " + boost)
                            })
                            .catch((err) => {
                                console.log("Database error: " + err)
                            })
                    })
                }

                //delete comment images
                post.comments.forEach((comment) => {
                    if (comment.images) {
                        comment.images.forEach((image) => {
                            fs.unlink(global.appRoot + '/cdn/images/' + image, (err) => {
                                if (err) console.log("Image deletion error " + err)
                            });
                            Image.deleteOne({
                                "filename": image
                            });
                        })
                    }
                });

                // Delete notifications
                User.update({}, {
                        $pull: {
                            notifications: {
                                subjectId: post._id
                            }
                        }
                    }, {
                        multi: true
                    })
                    .then(response => {
                        console.log(response)
                    })
            })
            .catch((err) => {
                console.log("Database error: " + err)
            })
            .then(() => {
                Post.deleteOne({
                        "_id": req.params.postid
                    })
                    .then(() => {
                        res.sendStatus(200);
                    })
                    .catch((err) => {
                        console.log("Database error: " + err)
                    });
            });
    });

    //Responds to post requests which create a comment.
    //Inputs: comment body, filenames of comment images, descriptions of comment images
    //Outputs: makes the comment document (with the body parsed for urls, tags, and @mentions), embeds a comment document in its post document,
    //moves comment images out of temp. Also, notify the owner of the post, people subscribed to the post, and everyone who was mentioned.
    app.post("/createcomment/:postid", isLoggedInOrErrorResponse, function (req, res) {
        console.log(req.body)
        let parsedResult = helper.parseText(req.body.commentContent);
        commentTimestamp = new Date();
        let postImages = JSON.parse(req.body.imageUrls).slice(0, 4); //in case someone tries to send us more images than 4
        if (!(postImages || parsedResult)) { //in case someone tries to make a blank comment with a custom ajax post request. storing blank comments = not to spec
            res.status(400).send('bad post op');
            return;
        }
        const comment = {
            authorEmail: req.user.email,
            author: req.user._id,
            timestamp: commentTimestamp,
            rawContent: sanitize(req.body.commentContent),
            parsedContent: parsedResult.text,
            mentions: parsedResult.mentions,
            tags: parsedResult.tags,
            images: postImages,
            imageDescriptions: JSON.parse(req.body.imageDescs).slice(0, 4)
        };

        Post.findOne({
                "_id": req.params.postid
            })
            .populate('author')
            .then((post) => {
                postPrivacy = post.privacy;
                post.comments.push(comment);
                post.numberOfComments = post.comments.length;
                post.lastUpdated = new Date();
                // Add user to subscribed users for post
                if ((!post.author._id.equals(req.user._id) && post.subscribedUsers.includes(req.user._id.toString()) === false)) { // Don't subscribe to your own post, or to a post you're already subscribed to
                    post.subscribedUsers.push(req.user._id.toString());
                }
                post.save()
                    .then(() => {

                        // Parse images
                        if (postImages) {
                            postImages.forEach(function (imageFileName) {
                                if (imageFileName) {
                                    fs.rename("./cdn/images/temp/" + imageFileName, "./cdn/images/" + imageFileName, function (e) {
                                        if (e) {
                                            console.log("could not move " + imageFileName + " out of temp");
                                            console.log(e);
                                        }
                                    }) //move images out of temp storage
                                    image = new Image({
                                        context: "user",
                                        filename: imageFileName,
                                        privacy: post.privacy,
                                        user: req.user._id
                                    })
                                    image.save();
                                }
                            });
                        }

                        //Notify any and all interested parties
                        User.findOne({
                                _id: post.author
                            })
                            .then((originalPoster) => {
                                //remove duplicates from subscribed/unsubscribed users
                                subscribedUsers = post.subscribedUsers.filter((v, i, a) => a.indexOf(v) === i);
                                unsubscribedUsers = post.unsubscribedUsers.filter((v, i, a) => a.indexOf(v) === i);

                                //NOTIFY EVERYONE WHO IS MENTIONED

                                //we're never going to notify the author of the comment about them mentioning themself
                                workingMentions = parsedResult.mentions.filter(m => m != req.user.username);

                                if (post.type == "community") {
                                    workingMentions.forEach(function (mentionedUsername) {
                                        User.findOne({
                                            username: mentionedUsername
                                        }).then((mentionedUser) => {
                                            //within communities: notify the mentioned user if this post's community is one they belong to
                                            if (mentionedUser.communities.some(c => c.toString() == post.community.toString())) {
                                                notifier.notify('user', 'mention', mentionedUser._id, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'reply')
                                            }
                                        }).catch(err => {
                                            console.log("could not find document for mentioned user " + mentionedUsername + ", error:");
                                            console.log(err);
                                        })
                                    })
                                } else {
                                    if (postPrivacy == "private") {
                                        workingMentions.forEach(mentionedUsername => {
                                            User.findOne({
                                                username: mentionedUsername
                                            }).then(mentionedUser => {
                                                // Make sure to only notify mentioned people if they are trusted by the post's author (and can therefore see the post).
                                                // The post's author is implicitly trusted by the post's author
                                                if (mentionedUser._id.equals(originalPoster._id)) {
                                                    notifier.notify('user', 'mention', mentionedUser._id, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'reply')
                                                    return; //no need to go down there and check for relationships and stuff
                                                }
                                                Relationship.findOne({
                                                    fromUser: originalPoster._id,
                                                    toUser: mentionedUser._id,
                                                    value: "trust"
                                                }, {
                                                    _id: 1
                                                }).then(theRelationshipExists => {
                                                    if (theRelationshipExists) {
                                                        notifier.notify('user', 'mention', mentionedUser._id, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'reply')
                                                    }
                                                })
                                            }).catch(err => {
                                                console.log("could not find document for mentioned user " + mention + ", error:");
                                                console.log(err);
                                            })
                                        })
                                    } else if (postPrivacy == "public") {
                                        workingMentions.forEach(function (mention) {
                                            User.findOne({
                                                    username: mention
                                                })
                                                .then((mentionedGuy) => {
                                                    //notify everyone
                                                    notifier.notify('user', 'mention', mentionedGuy._id, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'reply')
                                                }).catch(err => {
                                                    console.log("could not find document for mentioned user " + mention + ", error:");
                                                    console.log(err);
                                                })
                                        });
                                    }
                                }

                                // NOTIFY THE POST'S AUTHOR
                                // Author doesn't need to know about their own comments, and about replies on your posts they're not subscribed to, and if they're @ed they already got a notification above
                                if (!originalPoster._id.equals(req.user._id) && (post.unsubscribedUsers.includes(originalPoster._id.toString()) === false) && (!parsedResult.mentions.includes(originalPoster.username))) {
                                    console.log("Notifying post author of a reply")
                                    notifier.notify('user', 'reply', originalPoster._id, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'post')
                                }

                                //NOTIFY PEOPLE WHO BOOSTED THE POST
                                if (post.boostsV2.length > 1) {
                                    var boosterIDs = [];
                                    post.boostsV2.populate('booster', (err, boosts) => {
                                        if (err) {
                                            console.log('could not notify people who boosted post ' + post._id.toString() + " of a recent reply:");
                                            console.log(err);
                                        } else {
                                            boosts.forEach(boost => {
                                                boosterIDs.push(boost.booster._id);
                                                //make sure we're not notifying the person who left the comment (this will be necessary if they left it on their own boosted post)
                                                //and make sure we're not notifying the post's author (necessary if they boosted their own post) (they'll have gotten a notification above)
                                                //and make sure we're not notifying anyone who was @ed (they'll have gotten a notification above),
                                                //or anyone who unsubscribed from the post
                                                if (!boost.booster._id.equals(req.user._id) &&
                                                    !boost.booster._id.equals(originalPoster._id) &&
                                                    !parsedResult.mentions.includes(boost.booster.username) &&
                                                    !post.unsubscribedUsers.includes(boost.booster._id.toString())) {
                                                    notifier.notify('user', 'boostedPostReply', boost.booster._id, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'post')
                                                }
                                            })
                                        }
                                        //if there are boosters, we notify the other "subscribers" here, because here we have the full list of
                                        //boosters and can check the subscribers against it before notifying them
                                        var workingSubscribers = post.subscribedUsers.filter(u => !boosterIDs.includes(u));
                                        notifySubscribers(workingSubscribers);
                                    })
                                }

/*                              This is the version of the above that worked with the old model of storing boosts in the database.
                                var boosterIDs = [];
                                post.boosts.forEach(boostID => {
                                    Post.findById(boostID).then(boost => {
                                        boosterIDs.push(boost.author.toString());
                                        //this is true once we've added a boost author into our array for each boost, so it only runs the last time this is called
                                        if (boosterIDs.length == post.boosts.length) {
                                            //remove duplicate ids for people who've boosted it more than once,
                                            //and make sure we're not notifying the person who left the comment (this will be necessary if they left it on their own boosted post)
                                            //and make sure we're not notifying the post's author (necessary if they boosted their own post) (they'll have gotten a notification above)
                                            boosterIDs = boosterIDs.filter((v, i, a) => a.indexOf(v) === i && v != req.user._id.toString() && v != originalPoster._id.toString());
                                            boosterIDs.forEach(boosterID => {
                                                User.findById(boosterID).then(booster => {
                                                    //and make sure we're not notifying anyone who was @ed (they'll have gotten a notification above),
                                                    //or anyone who unsubscribed from the post
                                                    if (!parsedResult.mentions.includes(booster.username) && !post.unsubscribedUsers.includes(boosterID.toString())) {
                                                        notifier.notify('user', 'boostedPostReply', booster._id, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'post')
                                                    }
                                                }).catch(err => {
                                                    console.log("could not find document for booster " + boosterID + ", error:")
                                                    console.log(err);
                                                })
                                            })

                                            //if there are boosters, we notify the other "subscribers" here, because here we have the full list of
                                            //boosters and can check the subscribers against it before notifying them
                                            var workingSubscribers = post.subscribedUsers.filter(u => !boosterIDs.includes(u));
                                            notifySubscribers(workingSubscribers);
                                        }
                                    })
                                })
*/

                                //NOTIFY THE OTHER SUBSCRIBERS (PEOPLE WHO WERE MENTIONED IN THE ORGINAL POST AND THOSE WHO COMMENTED ON IT)

                                //if there are boosts for this post, this was called a few lines up from here. otherwise, we do it now
                                if (post.boosts.length === 0) {
                                    notifySubscribers(post.subscribedUsers)
                                }

                                //checks each subscriber for trustedness if this is a private post, notifies all of 'em otherwise
                                function notifySubscribers(subscriberList) {
                                    if (postPrivacy == "private") {
                                        subscriberList.forEach(subscriberID => {
                                            Relationship.findOne({
                                                fromUser: originalPoster._id,
                                                toUser: subscriberID,
                                                value: "trust"
                                            }, {
                                                _id: 1
                                            }).then(theRelationshipExists => {
                                                if (theRelationshipExists) {
                                                    notifySubscriber(subscriberID);
                                                }
                                            })
                                        })
                                    } else {
                                        subscriberList.forEach(subscriberID => {
                                            notifySubscriber(subscriberID);
                                        })
                                    }
                                }

                                function notifySubscriber(subscriberID) {
                                    if ((subscriberID != req.user._id.toString()) // Do not notify the comment's author about the comment
                                        &&
                                        (subscriberID != originalPoster._id.toString()) //don't notify the post's author (because they get a different notification, above)
                                        &&
                                        (post.unsubscribedUsers.includes(subscriberID) === false) //don't notify unsubscribed users
                                    ) {
                                        console.log("Notifying subscribed user");
                                        User.findById(subscriberID).then((subscriber) => {
                                            if (!parsedResult.mentions.includes(subscriber.username)) { //don't notify people who are going to be notified anyway bc they're mentioned in the new comment
                                                if (post.mentions.includes(subscriber.username)) {
                                                    notifier.notify('user', 'mentioningPostReply', subscriberID, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'post')
                                                } else {
                                                    notifier.notify('user', 'subscribedReply', subscriberID, req.user._id, post._id, '/' + originalPoster.username + '/' + post.url, 'post')
                                                }
                                            }
                                        }).catch(err => {
                                            console.log("could not find subscribed user " + subscriberID + ", error:")
                                            console.log(err);
                                        })
                                    }
                                }

                            }).catch(err => {
                                console.log("can't find author of commented-upon post, error:");
                                console.log(err);
                            })

                        if (req.user.imageEnabled) {
                            image = req.user.image
                        } else {
                            image = 'cake.svg'
                        }
                        if (req.user.displayName) {
                            name = '<div class="author-display-name"><strong><a class="authorLink" href="/' + req.user.username + '">' + req.user.displayName + '</a></strong></div><div class="author-username"><span class="text-muted">@' + req.user.username + '</span></div>';
                        } else {
                            name = '<div class="author-username"><strong><a class="authorLink" href="/' + req.user.username + '">@' + req.user.username + '</a></strong></div>';
                        }

                        result = {
                            image: image,
                            name: name,
                            username: req.user.username,
                            timestamp: moment(commentTimestamp).fromNow(),
                            content: parsedResult.text,
                            comment_id: post.comments[post.numberOfComments - 1]._id.toString(),
                            post_id: post._id.toString()
                        }
                        console.log(result);
                        res.contentType('json');
                        res.send(JSON.stringify(result));
                    })
                    .catch((err) => {
                        console.log("Database error: " + err)
                    });
            })
    });

    //Responds to post requests that delete comments.
    //Input: postid and commentid.
    //Output: deletes each of the comment's images and removes the comment's document from the post. Then, updates the post's lastUpdated field to be
    //that of the new most recent comment's (or the time of the post's creation if there are no comments left) with the relocatePost function. Also
    //updates numberOfComments.
    app.post("/deletecomment/:postid/:commentid", isLoggedInOrRedirect, function (req, res) {
        Post.findOne({
                "_id": req.params.postid
            })
            .then((post) => {

                //i'll be impressed if someone trips this one, comment ids aren't displayed for comments that the logged in user didn't make
                if (!post.comments.id(req.params.commentid).author.equals(req.user._id) && post.author.toString()!=req.user._id.toString()) {
                    res.status(400).send("you do not appear to be who you would like us to think that you are! this comment ain't got your brand on it");
                    return;
                }

                post.comments.id(req.params.commentid).images.forEach((image) => {
                    fs.unlink(global.appRoot + '/cdn/images/' + image, (err) => {
                        if (err) console.log("Image deletion error " + err)
                    })
                    Image.deleteOne({
                        "filename": image
                    })
                })
                post.comments.id(req.params.commentid).remove();
                post.numberOfComments = post.comments.length;
                post.save()
                    .then((comment) => {
                        relocatePost(ObjectId(req.params.postid));
                        //unsubscribe the author of the deleted comment from the post if they have no other comments on it

                        if (!post.comments.some((v, i, a) => {
                                return v.author.toString() == req.user._id.toString();
                            })) {
                            post.subscribedUsers = post.subscribedUsers.filter((v, i, a) => {
                                return v != req.user._id.toString();
                            })
                            post.save().catch(err => {
                                console.error(err)
                            })
                        }
                        res.sendStatus(200);
                    })
                    .catch((error) => {
                        console.error(error)
                    })
            })
            .catch((err) => {
                console.log("Database error: " + err)
            })
    });

    //Responds to a post request that boosts a post.
    //Inputs: id of the post to be boosted
    //Outputs: a new post of type boost, adds the id of that new post into the boosts field of the old post, sends a notification to the
    //user whose post was boosted.
    app.post('/createboost/:postid', isLoggedInOrRedirect, function (req, res) {
        boostedTimestamp = new Date();
        Post.findOne({
                '_id': req.params.postid
            }, {
                boostsV2: 1,
                lastUpdated: 1,
                privacy: 1,
                unsubscribedUsers: 1,
                author: 1,
                url:1
            }).populate('author')
            .then((boostedPost) => {
                if (boostedPost.privacy != "public" || boostedPost.type == 'community') {
                    res.status(400).send("post is not public and therefore may not be boosted");
                    return;
                }
                const boost = {
                    booster: req.user._id,
                    timestamp: boostedTimestamp
                }
                boostedPost.boostsV2 = boostedPost.boostsV2.filter(boost => {
                    return !boost.booster.equals(req.user._id)
                })
                boostedPost.boostsV2.push(boost);
                boostedPost.lastUpdated = boostedTimestamp;

                // don't think so
                //boostedPost.subscribedUsers.push(req.user._id.toString());

                boostedPost.save().then(() => {
                    //don't notify the original post's author if they're creating the boost or are unsubscribed from this post
                    if (!boostedPost.unsubscribedUsers.includes(boostedPost.author._id.toString()) && !boostedPost.author._id.equals(req.user._id)) {
                        notifier.notify('user', 'boost', boostedPost.author._id, req.user._id, null, '/' + boostedPost.author.username + '/' + boostedPost.url, 'post')
                    }
                    res.redirect("back");
                })
            })
    })

//Responds to a post request that boosts a post.
    //Inputs: id of the post to be boosted
    //Outputs: a new post of type boost, adds the id of that new post into the boosts field of the old post, sends a notification to the
    //user whose post was boosted.
    app.post('/removeboost/:postid', isLoggedInOrRedirect, function (req, res) {
        Post.findOne({
                '_id': req.params.postid
            }, {
                boostsV2: 1,
                lastUpdated: 1,
                privacy: 1,
                unsubscribedUsers: 1,
                author: 1,
                url:1,
                timestamp:1
            })
            .then((boostedPost) => {
                boostedPost.boostsV2 = boostedPost.boostsV2.filter(boost => {
                    return !boost.booster.equals(req.user._id)
                })
                if(boostedPost.author.equals(req.user._id)){
                    boostedPost.boostsV2.unshift({booster: boostedPost.author, timestamp: boostedPost.timestamp});
                }
                boostedPost.save().then(() => {
                    relocatePost(req.params.postid);
                    res.redirect("back");
                })
            })
    })
};

function cleanTempFolder() {
    fs.readdir("./cdn/images/temp", function (err, files) {
        files.forEach(file => {
            if (file != ".gitkeep" && file != "") {
                fs.stat("./cdn/images/temp/" + file, function (err, s) {
                    if (Date.now() - s.mtimeMs > 3600000) {
                        fs.unlink("./cdn/images/temp/" + file, function (e) {
                            if (e) {
                                console.log("couldn't clean temp file " + file);
                                console.log(e);
                            }
                        })
                    }
                })
            }
        });
    });
    setTimeout(cleanTempFolder, 3600000);
}

setTimeout(cleanTempFolder, 3600000); //clean temp image folder every hour

//For post and get requests where the browser will handle the response automatically and so redirects will work
function isLoggedInOrRedirect(req, res, next) {
    if (req.isAuthenticated()) {
        // A potentially expensive way to update a user's last logged in timestamp (currently only relevant to sorting search results)
        currentTime = new Date();
        if ((currentTime - req.user.lastUpdated) > 3600000) { // If the timestamp is older than an hour
            User.findOne({
                    _id: req.user._id
                })
                .then(user => {
                    user.lastUpdated = currentTime;
                    user.save()
                })
        }
        return next();
    }
    res.redirect('/');
    next('route');
}

//For post requests where the jQuery code making the request will handle the response
function isLoggedInOrErrorResponse(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.send('nope');
    next('route');
}

function getTags(url) {
    return new Promise((resolve, reject) => {
        request('https://api.imagga.com/v2/tags?image_url=' + url, imaggaOptions, function (error, response, body) {
            if (error) {
                console.log(error);
                tagList = {}
                resolve(tagList)
            } else {
                var parsedBody = JSON.parse(body);
                if (parsedBody.status.type != "error") {
                    var threshold = 60;
                    var tagList = {
                        auto: [],
                        all: []
                    }
                    var tags = parsedBody.result.tags;
                    for (var i = 0, ii = tags.length; i < ii; i++) {
                        var tag = tags[i],
                            t = tag.tag.en;
                        // Add first three tags to 'auto-suggest' array, along with any
                        // others over confidence threshold
                        if (tagList.auto.length < 3 || tag.confidence > threshold) {
                            tagList.auto.push(t);
                        }
                        tagList.all.push(t);
                    }
                    if (error) reject(error);
                    else resolve(tagList);
                } else {
                    tagList = {}
                    resolve(tagList)
                }
            }
        })
    })
}

//This function relocates posts on the timeline when a comment is deleted by changing lastUpdated (the post feed sorting field.)
//input: post id
//output: the post's lastUpdated field is set to either the timestamp of the new most recent comment or if there are no comments remaining the timestamp of the post
function relocatePost(postid) {
    Post.aggregate(
        [
            {
              '$match': {
                '_id': new ObjectId(postid)
              }
            }, {
              '$project': {
                'activity': {
                  '$concatArrays': [
                    '$comments', '$boostsV2'
                  ]
                }
              }
            }, {
              '$unwind': {
                'path': '$activity'
              }
            }, {
              '$sort': {
                'activity.timestamp': -1
              }
            }
          ]
        )
        .then(result => {
            if (result.length) {
                Post.findOneAndUpdate({
                        _id: postid
                    }, {
                        $set: {
                            lastUpdated: result[0].timestamp
                        }
                    }, {
                        returnNewDocument: true
                    })
                    .then(updatedPost => {
                        console.log(updatedPost)
                    }).catch(err=>{
                        console.log('could not relocate post:');
                        console.log(err)
                    })
            } else {
                Post.findById(postid).then(post => {
                    Post.findOneAndUpdate({
                        _id: postid
                    }, {
                        $set: {
                            lastUpdated: post.timestamp
                        }
                    }, {
                        returnNewDocument: true
                    }).catch(err=>{
                        console.log('could not relocate post:')
                        console.log(err)
                    })
                })
            }
        })
        .catch(error => {
            console.error(error);
        })
}
