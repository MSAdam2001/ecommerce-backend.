const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { protect } = require('../middleware/auth');

let stripe;
try {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} catch (err) {
  console.log('Stripe init error:', err.message);
}

router.post('/create-checkout-session', protect, async (req, res) => {
  try {
    console.log('Payment request received');
    console.log('User:', req.user?._id);
    console.log('Body:', JSON.stringify(req.body));

    const { items, shippingAddress } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No items provided' });
    }

    if (!stripe) {
      return res.status(500).json({ message: 'Stripe not configured' });
    }

    const lineItems = items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
        },
        unit_amount: Math.round(Number(item.price) * 100)
      },
      quantity: Number(item.quantity)
    }));

    console.log('Line items:', JSON.stringify(lineItems));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.CLIENT_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/cart`,
      metadata: {
        userId: req.user._id.toString(),
        shippingAddress: JSON.stringify(shippingAddress)
      }
    });

    console.log('Stripe session created:', session.id);

    const totalPrice = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);

    const order = await Order.create({
      user: req.user._id,
      items: items.map(item => ({
        product: item.product,
        name: item.name,
        price: Number(item.price),
        quantity: Number(item.quantity),
        image: item.image || ''
      })),
      shippingAddress,
      totalPrice,
      paymentStatus: 'pending',
      orderStatus: 'processing',
      stripeSessionId: session.id
    });

    console.log('Order created:', order._id);

    res.json({
      success: true,
      sessionId: session.id,
      sessionUrl: session.url,
      orderId: order._id
    });

  } catch (err) {
    console.error('Payment route error:', err.message);
    console.error('Full error:', err);
    res.status(500).json({ message: 'Payment error', error: err.message });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  res.json({ received: true });
});

router.get('/verify/:sessionId', protect, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    const order = await Order.findOne({ stripeSessionId: req.params.sessionId });
    if (session.payment_status === 'paid' && order) {
      await Order.findByIdAndUpdate(order._id, { paymentStatus: 'paid' });
    }
    res.json({ success: true, session, order });
  } catch (err) {
    res.status(500).json({ message: 'Verification error', error: err.message });
  }
});

module.exports = router;