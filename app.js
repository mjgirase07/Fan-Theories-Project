const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const mysql = require('mysql');
const app = express();
const { exec } = require('child_process');
const { spawn } = require('child_process');
const Sentiment = require('sentiment');
const sentiment = new Sentiment();
const port = 3000;

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(fileUpload());
app.use(bodyParser.json());

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'M1hendra@2004',
    database: 'fan_theories',
});

db.connect((err) => {
    if (err) {
        console.error('Unable to connect to MySQL:', err);
    } else {
        console.log('Connected to MySQL database');
    }
});

app.use(bodyParser.json());


// Endpoint to get movie information for a specific movie_id
app.get('/getMovieInfo/:movie_id', (req, res) => {
    const { movie_id } = req.params;
    const getMovieInfoQuery = 'SELECT * FROM movie_info WHERE movie_id = ?';
    db.query(getMovieInfoQuery, [movie_id], (err, result) => {
        if (err) {
            console.error('Error fetching movie info:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            const movieInfo = result[0];
            res.json(movieInfo);
        }
    });
});

// Endpoint to get tweets for a specific movie_id
app.get('/getTweets/:movie_id', (req, res) => {
    const { movie_id } = req.params;
    const getTweetsQuery = `
        SELECT theory_info.theory, theory_info.user_id, user_profile.user_name, user_profile.photo_url
        FROM theory_info
        JOIN user_profile ON theory_info.user_id = user_profile.user_id
        WHERE theory_info.movie_id = ?`;

    db.query(getTweetsQuery, [movie_id], (err, result) => {
        if (err) {
            console.error('Error fetching tweets:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            const tweets = result.map(row => ({
                theory: row.theory,
                user: {
                    user_id: row.user_id,
                    user_name: row.user_name,
                    photo_url: row.photo_url
                }
            }));
            res.json({ tweets });
        }
    });
});


// Endpoint to submit user-generated tweets
app.post('/submitTweet', (req, res) => {
    const { tweet, movie_id, user_id } = req.body;

    // Fetch the latest serial_no from theory_info for the given movie_id
    const getSerialNoQuery = 'SELECT MAX(serial_no) as max_serial FROM theory_info WHERE movie_id = ?';
    db.query(getSerialNoQuery, [movie_id], (err, result) => {
        if (err) {
            console.error('Error fetching max serial_no:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            const serial_no = result[0].max_serial ? result[0].max_serial + 1 : 1;

            // Insert the user-generated tweet into theory_info
            const insertTweetQuery = 'INSERT INTO theory_info (serial_no, movie_id, user_id, theory) VALUES (?, ?, ?, ?)';
            db.query(insertTweetQuery, [serial_no, movie_id, user_id, tweet], (err) => {
                if (err) {
                    console.error('Error inserting tweet:', err);
                    res.status(500).json({ error: 'Internal Server Error' });
                } else {
                    res.json({ tweet });
                }
            });
        }
    });
});

// Endpoint to handle user login
app.post('/login', (req, res) => {
    const { user_id, password } = req.body;

    // Query to check if the user_id and password match
    const loginQuery = 'SELECT * FROM user_profile WHERE user_id = ? AND password = ?';

    db.query(loginQuery, [user_id, password], (err, result) => {
        if (err) {
            console.error('Error checking login:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            if (result.length > 0) {
                // Login successful, redirect to homepage with user_id
                res.json({ user_id });

            } else {
                // Incorrect credentials
                res.status(401).json({ error: 'Incorrect user_id or password' });
            }
        }
    });
});



// Add console log to profile endpoint
app.get('/profile/:user_id', (req, res) => {
    const { user_id } = req.params;
    const getUserProfileQuery = 'SELECT user_id, user_name, photo_url, user_bio FROM user_profile WHERE user_id = ?';

    db.query(getUserProfileQuery, [user_id], (err, result) => {
        if (err) {
            console.error('Error fetching user profile:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            if (result.length > 0) {
                const userProfile = {
                    user_id: result[0].user_id,
                    user_name: result[0].user_name,
                    photo_url: result[0].photo_url,
                    user_bio: result[0].user_bio
                };
                console.log('User Profile Data:', userProfile); // Add this line
                res.json(userProfile);
            } else {
                // User not found
                res.status(404).json({ error: 'User not found' });
            }
        }
    });
});


// Add a new endpoint to get tweets by user_id
app.get('/getTweetsByUser/:user_id', (req, res) => {
    const { user_id } = req.params;
    const getTweetsByUserQuery = `
        SELECT theory_info.theory, theory_info.user_id, user_profile.user_name, user_profile.photo_url
        FROM theory_info
        JOIN user_profile ON theory_info.user_id = user_profile.user_id
        WHERE theory_info.user_id = ?`;

    db.query(getTweetsByUserQuery, [user_id], (err, result) => {
        if (err) {
            console.error('Error fetching tweets by user:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            const tweets = result.map(row => ({
                theory: row.theory,
                user: {
                    user_id: row.user_id,
                    user_name: row.user_name,
                    photo_url: row.photo_url
                }
            }));
            res.json({ tweets });
        }
    });
});

// Endpoint for sentiment analysis
app.get('/sentiment-analysis/:movie_id', (req, res) => {
    const { movie_id } = req.params;

    // Fetch tweets for the specified movie from the database
    const getTweetsQuery = 'SELECT theory FROM theory_info WHERE movie_id = ?';
    db.query(getTweetsQuery, [movie_id], (err, results) => {
        if (err) {
            console.error('Error fetching tweets from database:', err);
            res.status(500).json({ error: 'Internal Server Error' });
            return;
        }

        // Extract tweet text from results
        const tweets = results.map(row => row.theory); // Corrected from tweet_text to theory

        // Perform sentiment analysis
        const sentimentScores = {
            positive: 0,
            neutral: 0,
            negative: 0
        };

        tweets.forEach(tweet => {
            const result = sentiment.analyze(tweet);
            if (result.score > 0) {
                sentimentScores.positive++;
            } else if (result.score === 0) {
                sentimentScores.neutral++;
            } else {
                sentimentScores.negative++;
            }
        });

        res.json({ sentimentScores });
    });
});


// Add a new endpoint for user registration
app.post('/register', (req, res) => {
    const { user_id, user_name, password, bio } = req.body;
    const photo = req.files.photo; // Assuming you are using middleware like 'express-fileupload' for file uploads

    // Insert data into user_profile table
    const insertUserQuery = 'INSERT INTO user_profile (user_id, user_name, password, photo_url, user_bio) VALUES (?, ?, ?, ?, ?)';

    // Generate a unique filename for the photo to avoid conflicts
    const photoFileName = `user_${user_id}_${Date.now()}_${photo.name}`;

    // Move the photo to a specific directory (you need to create this directory)
    const photoPath = path.join(__dirname, 'public', 'user_photos', photoFileName);

    photo.mv(photoPath, (err) => {
        if (err) {
            console.error('Error saving photo:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            const photoUrl = `/user_photos/${photoFileName}`;

            db.query(insertUserQuery, [user_id, user_name, password, photoUrl, bio], (err) => {
                if (err) {
                    console.error('Error inserting user data:', err);
                    res.status(500).json({ error: 'Internal Server Error' });
                } else {
                    res.json({ success: true });
                }
            });
        }
    });
});



// Endpoint to handle sentiment analysis data retrieval
app.get('/api/sentiment-analysis', (req, res) => {
    const reviewId = req.query.reviewId;
    const query = `SELECT positive_score, neutral_score, negative_score FROM movie_reviews WHERE review_id = ?`;

    db.query(query, [reviewId], (err, results) => {
        if (err) {
            console.error('Error fetching sentiment analysis data:', err);
            res.status(500).json({ message: 'Internal server error' });
            return;
        }

        if (results.length === 0) {
            res.status(404).json({ message: 'Sentiment analysis data not found' });
            return;
        }

        console.log('Sentiment Analysis Data:', results[0]); // Log the data
        res.json(results[0]); // Assuming there's only one entry for each review_id
    });
});



// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Define a route handler for the root path (homepage)
app.get('/', (req, res) => {
    const { user_id } = req.params;
    res.sendFile(path.join(__dirname, 'public', 'homepage.html'));
});

// Assuming you have a route like this to render the homepage
app.get('/homepage/:user_id', (req, res) => {
    const { user_id } = req.params;
    res.sendFile(path.join(__dirname, 'public', 'homepage.html'));
});

// Add a route for the loginpage
app.get('/loginpage', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'loginpage.html'));
});

// Update your server code
app.get('/fantheories/:movie_id/:user_id', (req, res) => {
    const { movie_id } = req.params;
    const { user_id } = req.params;
    res.sendFile(path.join(__dirname, 'public', 'fantheories.html'));
});

// Add a route to serve the userprofile.html page
app.get('/userprofile/:user_id', (req, res) => {
    const { user_id } = req.params;
    res.sendFile(path.join(__dirname, 'public', 'userprofile.html'));
});

// Add this route to your Express server configuration
app.get('/registration', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'registration.html'));
});

// Add this route to your Express server configuration
app.get('/moviereviews/:user_id', (req, res) => {
    const { user_id } = req.params;
    res.sendFile(path.join(__dirname, 'public', 'moviereviews.html'));
});
app.get('/recommendations', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chatbot.html'));
});

app.listen(port, () => console.log(`Server is running on http://localhost:${port}`));