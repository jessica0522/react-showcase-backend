import fs from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import  admin  from 'firebase-admin';
import express from 'express';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename)


const credentials = JSON.parse(
  fs.readFileSync('./serviceAccountKey.json')
);

initializeApp({
  credential: cert(credentials)
});

const db = getFirestore();
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../build')));

app.get(/^(?!\/api).+/, (req, res) => {
  res.sendFile(path.join(__dirname, '../build/index.html'))
})

app.use(async (req, res, next) => {
  const { authtoken } = req.headers;

  if(authtoken){
      try {
        const user = await admin.auth().verifyIdToken(authtoken);
          req.user = user;
      } catch {
          return res.sendStatus(401)
      }
  }
  req.user = req.user || {};

  next();
})

// GEt API to query all posts and ordered by created time desc
app.get('/api/posts', async (req, res) => {
  try {
    const postsRef = db.collection('posts').orderBy('datetime', 'desc');
    const snapshot = await postsRef.get();
    let responseArr = []
  
    snapshot.forEach(doc => {
      const data = doc.data();
      data.datetime = data.datetime.toDate().toLocaleString();
      responseArr.push(data)
    })
    res.send(responseArr)
  } catch(error) {
    res.send(error)
  }
})

//GET API to fetch single post with postId
app.get('/api/posts/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const postRef = db.collection('posts').doc(id);
    const snapshot = await postRef.get();
    
    if (!snapshot.exists) {
      console.log('No such post!')
      res.sendStatus(404);
    } else {
      const data = snapshot.data();
      data.datetime = data.datetime.toDate().toLocaleString();
      res.send(data)
    }
  } catch (error) {
    res.send(error)
  }
});

// POST API to create a new post
app.post('/api/posts/add', async (req, res) => {
  const { datetime } = req.body;
  const formattedDate = Timestamp.fromDate(new Date(datetime));

  try {
    const docRef = await db.collection('posts').add({
      ...req.body,
      datetime: formattedDate,
      likes: [],
      id: null
    })
    // add generated id into data
    await docRef.update({ id: docRef.id });

    res.json({id: docRef.id, ...req.body})
  } catch (error) {
    console.error(error);
    res.sendStatus(500).json({error: "Faild to add new post"})
  }
})

// PUT API to modify likes field of a post
app.put('/api/posts/:postId/like', async (req, res) => {
  try {
      const postId = req.params.postId;
    // get user email from token
    const { email } = req.user;

      // Retrieve the post document from Firestore
      const postRef = db.collection('posts').doc(postId);
      const postSnapshot = await postRef.get();

      // Check if the post exists
      if (!postSnapshot.exists) {
          return res.status(404).json({ error: 'Post not found' });
      }

      // Get current likes array from the post data
      const postData = postSnapshot.data();
      const currentLikes = postData.likes || [];

      // Check if user email is already in likes array
      const userIndex = currentLikes.indexOf(email);
      if (userIndex !== -1) {
          // User email is already in likes array, so remove it
          currentLikes.splice(userIndex, 1);
      } else {
          // User email is not in likes array, so add it
          currentLikes.push(email);
      }

      // Update the 'likes' field of the post document in Firestore
      await postRef.update({ likes: currentLikes });

      return res.status(200).json(currentLikes);
  } catch (error) {
      console.error('Error updating likes:', error);
      return res.status(500).json({ error: 'Failed to update likes' });
  }
});

app.delete('/api/posts/:postId', async (req, res) => {
  try {
    const postId = req.params.postId;

    // get user email from token
    const { email } = req.user;

    // Retrieve the post document from Firestore
    const postRef = db.collection('posts').doc(postId);
    const postSnapshot = await postRef.get();

    // Check if the post exists
    if (!postSnapshot.exists) {
        return res.status(404).json({ error: 'Post not found' });
    }

    const postData = postSnapshot.data();
    const postAuthor = postData.author.email;

    if (email !== postAuthor) {
      return res.status(400).json({ error: 'You cannot delete the post since you are not the author!' });
    }

    await postRef.delete();

    return res.status(200).json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting post:', error);
    return res.status(500).json({ error: 'Failed to delete post' });
  }
})

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on PORT ${PORT}`);
})