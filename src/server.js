import fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import  admin  from 'firebase-admin';
import express from 'express';

const credentials = JSON.parse(
  fs.readFileSync('./serviceAccountKey.json')
);

initializeApp({
  credential: cert(credentials)
});

const db = getFirestore();
const app = express();
app.use(express.json());

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

app.get('/api/posts', async (req, res) => {
  try {
    const postsRef = db.collection('posts');
    const snapshot = await postsRef.get();
    let responseArr = []
  
    snapshot.forEach(doc => {
      responseArr.push(doc.data())
    })
    res.send(responseArr)
  } catch(error) {
    res.send(error)
  }
})

app.get('/api/posts/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const postRef = db.collection('posts').doc(id);
    const snapshot = await postRef.get();
    
    if (!snapshot.exists) {
      console.log('No such post!')
      res.sendStatus(404);
    } else {
      res.send(snapshot.data())
    }
  } catch (error) {
    res.send(error)
  }
});

app.post('/api/posts/add', async (req, res) => {
  try {
    const docRef = await db.collection('posts').add({
      ...req.body,
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on PORT ${PORT}`);
})