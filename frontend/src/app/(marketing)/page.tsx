'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Zap,
  CreditCard,
  Package,
  Users,
  BarChart3,
  Store,
  Shield,
  Menu,
  X,
  ArrowRight,
  Check,
  Play,
  Star,
  ChevronRight,
} from 'lucide-react';

const features = [
  {
    icon: CreditCard,
    title: 'Fast Checkout',
    description: 'Process transactions in seconds with our intuitive POS interface. Accept all payment methods.',
  },
  {
    icon: Package,
    title: 'Inventory Management',
    description: 'Track stock levels in real-time, set reorder alerts, and manage suppliers effortlessly.',
  },
  {
    icon: Users,
    title: 'Customer Loyalty',
    description: 'Build lasting relationships with loyalty programs, customer profiles, and targeted promotions.',
  },
  {
    icon: BarChart3,
    title: 'Analytics & Reports',
    description: 'Make data-driven decisions with comprehensive sales reports and business insights.',
  },
  {
    icon: Store,
    title: 'Multi-Location',
    description: 'Manage multiple stores from one dashboard. Transfer inventory and compare performance.',
  },
  {
    icon: Shield,
    title: 'Staff Management',
    description: 'Track employee hours, set permissions, and monitor performance across your team.',
  },
];

const testimonials = [
  {
    quote: "ProperPOS transformed how we run our cafe. The inventory tracking alone has saved us thousands in waste reduction.",
    author: "Sarah Chen",
    role: "Owner, Urban Brew Cafe",
  },
  {
    quote: "We switched from a legacy system and saw a 40% increase in checkout speed. Our customers love the faster service!",
    author: "Michael Rodriguez",
    role: "Manager, Fashion Forward",
  },
  {
    quote: "The multi-location support is incredible. I can see how all three of my stores are performing from my phone.",
    author: "Jennifer Park",
    role: "Founder, Fresh Mart",
  },
];

const plans = [
  {
    name: 'Starter',
    price: '$29',
    description: 'For small businesses',
    features: ['1 location', '2 staff accounts', 'Basic inventory', 'Sales reports', 'Email support'],
    cta: 'Get Started',
    href: '/register?plan=starter',
    featured: false,
  },
  {
    name: 'Professional',
    price: '$79',
    description: 'For growing businesses',
    features: ['3 locations', '10 staff accounts', 'Advanced inventory', 'Customer loyalty', 'Advanced analytics', 'Priority support'],
    cta: 'Start Free Trial',
    href: '/register?plan=professional',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: '$199',
    description: 'For large organizations',
    features: ['Unlimited locations', 'Unlimited staff', 'Custom integrations', 'API access', 'Dedicated support', 'SLA guarantee'],
    cta: 'Contact Sales',
    href: '/contact',
    featured: false,
  },
];

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed w-full z-50 top-0">
        <div className="mx-4 mt-4">
          <div className="max-w-7xl mx-auto bg-white/80 backdrop-blur-xl border border-gray-200/60 rounded-2xl px-6 py-3">
            <div className="flex justify-between items-center">
              <Link href="/" className="flex items-center gap-2.5 cursor-pointer">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-bold text-gray-900">ProperPOS</span>
              </Link>

              <div className="hidden md:flex items-center gap-8">
                <a href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition-colors cursor-pointer">Features</a>
                <a href="#pricing" className="text-sm text-gray-600 hover:text-gray-900 transition-colors cursor-pointer">Pricing</a>
                <a href="#testimonials" className="text-sm text-gray-600 hover:text-gray-900 transition-colors cursor-pointer">Testimonials</a>
                <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors cursor-pointer">Sign In</Link>
                <Link
                  href="/register"
                  className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors cursor-pointer"
                >
                  Start Free Trial
                </Link>
              </div>

              <button
                className="md:hidden p-2 cursor-pointer"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

            {mobileMenuOpen && (
              <div className="md:hidden mt-4 pt-4 border-t border-gray-100 pb-2 space-y-3">
                <a href="#features" className="block text-sm text-gray-600 py-2 cursor-pointer">Features</a>
                <a href="#pricing" className="block text-sm text-gray-600 py-2 cursor-pointer">Pricing</a>
                <a href="#testimonials" className="block text-sm text-gray-600 py-2 cursor-pointer">Testimonials</a>
                <Link href="/login" className="block text-sm text-gray-600 py-2 cursor-pointer">Sign In</Link>
                <Link href="/register" className="block bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium text-center cursor-pointer">
                  Start Free Trial
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-36 pb-20 px-4 sm:px-6 lg:px-8 gradient-mesh">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-1.5 rounded-full text-sm font-medium mb-8">
              <Zap className="w-3.5 h-3.5" />
              Now with AI-powered analytics
              <ChevronRight className="w-3.5 h-3.5" />
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight leading-[1.1] mb-6">
              The modern POS for{' '}
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 text-transparent bg-clip-text">
                growing businesses
              </span>
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed">
              Streamline your operations with an all-in-one point of sale system.
              Manage sales, inventory, customers, and analytics from anywhere.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/register"
                className="bg-gray-900 text-white px-7 py-3.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors shadow-lg shadow-gray-900/10 flex items-center justify-center gap-2 cursor-pointer"
              >
                Start 14-Day Free Trial
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#demo"
                className="border border-gray-300 text-gray-700 px-7 py-3.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                Watch Demo
              </a>
            </div>
            <p className="mt-5 text-xs text-gray-500">No credit card required. Cancel anytime.</p>
          </div>

          {/* Hero Image */}
          <div className="mt-20 relative max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl shadow-2xl shadow-gray-200/50 overflow-hidden border border-gray-200">
              <div className="bg-gray-900 px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="bg-gray-800 rounded-md px-4 py-1 text-xs text-gray-400">app.properpos.com</div>
                </div>
              </div>
              <div className="p-6 bg-gray-50">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-5">
                    <div className="h-44 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-lg flex items-center justify-center">
                      <BarChart3 className="w-16 h-16 text-indigo-300" />
                    </div>
                    <p className="mt-3 text-sm text-gray-500 font-medium">Real-time Dashboard</p>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-white rounded-xl border border-gray-100 p-4">
                      <div className="h-16 bg-emerald-50 rounded-lg flex items-center justify-center mb-2">
                        <Zap className="w-6 h-6 text-emerald-400" />
                      </div>
                      <p className="text-xs text-gray-500">Today's Sales</p>
                      <p className="text-lg font-bold text-gray-900">$4,521</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-100 p-4">
                      <div className="h-16 bg-blue-50 rounded-lg flex items-center justify-center mb-2">
                        <Package className="w-6 h-6 text-blue-400" />
                      </div>
                      <p className="text-xs text-gray-500">Orders</p>
                      <p className="text-lg font-bold text-gray-900">127</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="py-12 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-gray-400 uppercase tracking-wider mb-6">Trusted by businesses worldwide</p>
          <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-4">
            {['Acme Corp', 'TechStart', 'RetailPro', 'FoodChain', 'StyleHub'].map((company) => (
              <span key={company} className="text-lg font-semibold text-gray-300 select-none">{company}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <p className="text-sm font-medium text-indigo-600 mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4">
              Everything you need to run your business
            </h2>
            <p className="text-gray-600">
              Powerful features designed for modern retail and hospitality
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group p-6 rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-300 cursor-pointer"
              >
                <div className="w-11 h-11 bg-indigo-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-100 transition-colors">
                  <feature.icon className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <p className="text-sm font-medium text-indigo-600 mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-gray-600">Choose the plan that fits your business</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={
                  plan.featured
                    ? 'relative bg-gray-900 p-7 rounded-2xl text-white'
                    : 'bg-white p-7 rounded-2xl border border-gray-200'
                }
              >
                {plan.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-500 text-white px-4 py-1 rounded-full text-xs font-semibold">
                    Most Popular
                  </div>
                )}
                <h3 className={`text-lg font-semibold ${plan.featured ? 'text-white' : 'text-gray-900'}`}>
                  {plan.name}
                </h3>
                <p className={`text-sm mt-1 ${plan.featured ? 'text-gray-400' : 'text-gray-500'}`}>
                  {plan.description}
                </p>
                <div className="mt-5 mb-6">
                  <span className={`text-4xl font-bold ${plan.featured ? 'text-white' : 'text-gray-900'}`}>
                    {plan.price}
                  </span>
                  <span className={`text-sm ${plan.featured ? 'text-gray-400' : 'text-gray-500'}`}>/month</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5 text-sm">
                      <Check className={`w-4 h-4 flex-shrink-0 ${plan.featured ? 'text-indigo-400' : 'text-emerald-500'}`} />
                      <span className={plan.featured ? 'text-gray-300' : 'text-gray-600'}>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`block w-full py-3 px-6 rounded-xl text-center text-sm font-semibold transition-colors cursor-pointer ${
                    plan.featured
                      ? 'bg-white text-gray-900 hover:bg-gray-100'
                      : 'border-2 border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <p className="text-sm font-medium text-indigo-600 mb-3">Testimonials</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4">
              Loved by businesses everywhere
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="p-6 rounded-2xl border border-gray-100 bg-white">
                <div className="flex gap-0.5 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed mb-6">"{testimonial.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <span className="text-xs font-semibold text-gray-500">
                      {testimonial.author.split(' ').map(n => n[0]).join('')}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{testimonial.author}</p>
                    <p className="text-xs text-gray-500">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-900 rounded-3xl p-10 sm:p-16 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
              Ready to transform your business?
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto mb-10">
              Join thousands of businesses using ProperPOS to streamline operations and boost sales.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/register"
                className="bg-white text-gray-900 px-7 py-3.5 rounded-xl text-sm font-semibold hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                Start Your Free Trial
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/contact"
                className="border border-gray-700 text-gray-300 px-7 py-3.5 rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors cursor-pointer"
              >
                Talk to Sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-10">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-base font-bold text-gray-900">ProperPOS</span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                The modern point of sale system for growing businesses.
              </p>
            </div>
            {[
              {
                title: 'Product',
                links: [
                  { label: 'Features', href: '#features' },
                  { label: 'Pricing', href: '#pricing' },
                  { label: 'Integrations', href: '#' },
                  { label: 'API', href: '#' },
                ],
              },
              {
                title: 'Company',
                links: [
                  { label: 'About', href: '#' },
                  { label: 'Blog', href: '#' },
                  { label: 'Careers', href: '#' },
                  { label: 'Contact', href: '/contact' },
                ],
              },
              {
                title: 'Legal',
                links: [
                  { label: 'Privacy Policy', href: '/privacy' },
                  { label: 'Terms of Service', href: '/terms' },
                  { label: 'Cookie Policy', href: '#' },
                  { label: 'GDPR', href: '#' },
                ],
              },
            ].map((section) => (
              <div key={section.title}>
                <h4 className="text-sm font-semibold text-gray-900 mb-4">{section.title}</h4>
                <ul className="space-y-3">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="text-sm text-gray-500 hover:text-gray-900 transition-colors cursor-pointer">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 pt-8 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-400">
              &copy; {new Date().getFullYear()} ProperPOS. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
