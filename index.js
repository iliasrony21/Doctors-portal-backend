const express = require('express')
const app = express()

const { MongoClient, ServerApiVersion } = require('mongodb')
const cors = require('cors')
const jwt = require('jsonwebtoken')
require('dotenv').config()
const port = process.env.PORT || 5000

//middlewares

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tku7trh.mongodb.net/?retryWrites=true&w=majority`
console.log(uri)

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1
})

function verifyJWT (req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).send({ message: 'UnAuthorized access' })
  }
  const token = authHeader.split(' ')[1]
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden access' })
    }
    req.decoded = decoded
    next()
    console.log(decoded.foo) // bar
  })
}

async function run () {
  try {
    await client.connect()
    const serviceCollection = client.db('Doctor_sheba').collection('services')
    const bookingCollection = client.db('Doctor_sheba').collection('booking')
    const userCollection = client.db('Doctor_sheba').collection('users')
    const doctorCollection = client.db('Doctor_sheba').collection('doctors')

    const verifyAdmin = async (req, res, next) => {
      const email = req.params.email
      const requester = req.decoded.email
      const requesterAccount = await userCollection.findOne({
        email: requester
      })
      if (requesterAccount.role === 'admin') {
        next()
      } else {
        res.status(403).send({ message: 'forbidden' })
      }
    }
    app.get('/service', async (req, res) => {
      const query = {}
      const cursor = serviceCollection.find(query).project({ name: 1 })
      const services = await cursor.toArray()
      res.send(services)
    })

    app.get('/available', async (req, res) => {
      const date = req.query.date
      const services = await serviceCollection.find().toArray()
      const query = { date: date }
      const bookings = await bookingCollection.find(query).toArray()
      services.forEach(service => {
        const serviceBookings = bookings.filter(
          book => book.treatment === service.name
        )
        const bookedSlots = serviceBookings.map(book => book.slot)
        const available = service.slots.filter(
          slot => !bookedSlots.includes(slot)
        )
        service.slots = available
      })
      res.send(services)
    })
    app.get('/connect', (req, res) => {
      res.send('this is connected')
    })

    app.get('/booking', verifyJWT, async (req, res) => {
      const patientEmail = req.query.patientEmail
      const decodedEmail = req.decoded.email
      if (patientEmail === decodedEmail) {
        const query = { patientEmail: patientEmail }
        const bookings = await bookingCollection.find(query).toArray()
        return res.send(bookings)
      } else {
        return res.status(403).send({ message: 'forbidden access' })
      }
      // const authorizatiion = req.headers.authorization
      // console.log('auth header', authorizatiion)
    })
    app.get('/user', verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray()
      res.send(users)
    })
    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email
      const user = await userCollection.findOne({ email: email })
      const isAdmin = user.role === 'admin'
      res.send({ admin: isAdmin })
    })

    app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email

      const filter = { email: email }

      const updateDoc = {
        $set: { role: 'admin' }
      }
      const result = await userCollection.updateOne(filter, updateDoc)

      res.send(result)
    })

    app.put('/user/:email', async (req, res) => {
      const email = req.params.email
      console.log('put request email', email)
      const user = req.body
      const filter = { email: email }
      const options = { upsert: true }
      const updateDoc = {
        $set: user
      }
      const result = await userCollection.updateOne(filter, updateDoc, options)
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: '1h' }
      )
      res.send({ result, token })
    })
    app.post('/booking', async (req, res) => {
      const booking = req.body
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient
      }
      const exists = await bookingCollection.findOne(query)
      if (exists) {
        return res.send({ success: false, booking: exists })
      }
      const result = await bookingCollection.insertOne(booking)
      return res.send({ success: true, result })
    })
    app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body
      const result = await doctorCollection.insertOne(doctor)
      res.send(result)
    })
  } finally {
  }
}
run().catch(console.dir)
app.get('/', (req, res) => {
  res.send('Doctors sheba is on ')
})
app.listen(port, () => {
  console.log('Doctor portal listening port', port)
})
