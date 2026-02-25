'use client';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold">Privacy Policy</h1>
          <p className="mt-4 text-indigo-100">Last updated: January 15, 2025</p>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="prose prose-lg max-w-none">
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Introduction</h2>
            <p className="text-gray-600 mb-4">
              ProperPOS ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy
              explains how we collect, use, disclose, and safeguard your information when you use our
              point of sale and business management platform.
            </p>
            <p className="text-gray-600">
              Please read this Privacy Policy carefully. By using our Service, you consent to the practices
              described in this policy.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Information We Collect</h2>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">2.1 Information You Provide</h3>
            <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
              <li><strong>Account Information:</strong> Name, email address, phone number, business name, and password</li>
              <li><strong>Business Information:</strong> Business address, tax ID, industry type, and business registration details</li>
              <li><strong>Payment Information:</strong> Credit card numbers, bank account details, and billing addresses (processed securely by our payment partners)</li>
              <li><strong>Customer Data:</strong> Information about your customers that you input into the system</li>
              <li><strong>Product Data:</strong> Product names, descriptions, prices, and inventory levels</li>
              <li><strong>Transaction Data:</strong> Sales records, refunds, and payment history</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">2.2 Information Collected Automatically</h3>
            <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
              <li><strong>Device Information:</strong> IP address, browser type, operating system, and device identifiers</li>
              <li><strong>Usage Data:</strong> Pages visited, features used, time spent, and clickstream data</li>
              <li><strong>Location Data:</strong> General geographic location based on IP address</li>
              <li><strong>Cookies and Tracking:</strong> Information collected through cookies and similar technologies</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">2.3 Information from Third Parties</h3>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Payment processing information from Stripe and other payment providers</li>
              <li>Analytics data from services like Google Analytics</li>
              <li>Information from integrated third-party services you connect</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. How We Use Your Information</h2>
            <p className="text-gray-600 mb-4">We use the collected information for:</p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Providing, maintaining, and improving our Service</li>
              <li>Processing transactions and sending related information</li>
              <li>Managing your account and providing customer support</li>
              <li>Sending administrative messages, updates, and promotional communications</li>
              <li>Analyzing usage patterns to enhance user experience</li>
              <li>Detecting, preventing, and addressing fraud and security issues</li>
              <li>Complying with legal obligations and enforcing our terms</li>
              <li>Generating aggregated, anonymized analytics and insights</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. How We Share Your Information</h2>
            <p className="text-gray-600 mb-4">We may share your information with:</p>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">4.1 Service Providers</h3>
            <p className="text-gray-600 mb-4">
              Third-party vendors who perform services on our behalf, such as payment processing, data analysis,
              email delivery, hosting, and customer service.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">4.2 Business Partners</h3>
            <p className="text-gray-600 mb-4">
              Partners with whom we jointly offer products or services, with your consent.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">4.3 Legal Requirements</h3>
            <p className="text-gray-600 mb-4">
              When required by law, subpoena, or legal process, or to protect rights, property, or safety.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">4.4 Business Transfers</h3>
            <p className="text-gray-600">
              In connection with a merger, acquisition, or sale of assets, your information may be transferred
              to the acquiring entity.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Data Security</h2>
            <p className="text-gray-600 mb-4">
              We implement appropriate technical and organizational measures to protect your information, including:
            </p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Encryption of data in transit (TLS/SSL) and at rest (AES-256)</li>
              <li>Regular security assessments and penetration testing</li>
              <li>Access controls and authentication mechanisms</li>
              <li>Employee training on data protection practices</li>
              <li>Incident response procedures</li>
              <li>Regular backups and disaster recovery capabilities</li>
            </ul>
            <p className="text-gray-600 mt-4">
              However, no method of transmission or storage is 100% secure. We cannot guarantee absolute security.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Data Retention</h2>
            <p className="text-gray-600 mb-4">
              We retain your information for as long as your account is active or as needed to provide services.
              We may also retain and use information as necessary to:
            </p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Comply with legal obligations</li>
              <li>Resolve disputes</li>
              <li>Enforce agreements</li>
              <li>Support business operations</li>
            </ul>
            <p className="text-gray-600 mt-4">
              Transaction data is retained for a minimum of 7 years for tax and regulatory compliance.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Your Rights and Choices</h2>
            <p className="text-gray-600 mb-4">Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li><strong>Access:</strong> Request a copy of your personal information</li>
              <li><strong>Correction:</strong> Request correction of inaccurate data</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Portability:</strong> Request your data in a portable format</li>
              <li><strong>Opt-out:</strong> Opt-out of marketing communications</li>
              <li><strong>Restrict Processing:</strong> Request restriction of processing</li>
              <li><strong>Withdraw Consent:</strong> Withdraw previously given consent</li>
            </ul>
            <p className="text-gray-600 mt-4">
              To exercise these rights, contact us at privacy@properpos.com.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Cookies and Tracking Technologies</h2>
            <p className="text-gray-600 mb-4">We use cookies and similar technologies to:</p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Remember your preferences and settings</li>
              <li>Authenticate users and prevent fraud</li>
              <li>Analyze traffic and usage patterns</li>
              <li>Deliver targeted advertisements (with consent)</li>
            </ul>
            <p className="text-gray-600 mt-4">
              You can manage cookie preferences through your browser settings. Note that disabling cookies may
              affect Service functionality.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. International Data Transfers</h2>
            <p className="text-gray-600 mb-4">
              Your information may be transferred to and processed in countries other than your country of residence.
              These countries may have different data protection laws.
            </p>
            <p className="text-gray-600">
              When we transfer data internationally, we implement appropriate safeguards such as Standard
              Contractual Clauses or rely on adequacy decisions.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Children's Privacy</h2>
            <p className="text-gray-600">
              Our Service is not intended for children under 16. We do not knowingly collect information from
              children under 16. If we learn that we have collected information from a child under 16, we will
              delete it promptly.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. California Privacy Rights (CCPA)</h2>
            <p className="text-gray-600 mb-4">
              California residents have additional rights under the California Consumer Privacy Act:
            </p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Right to know what personal information is collected</li>
              <li>Right to know if personal information is sold or disclosed</li>
              <li>Right to opt-out of the sale of personal information</li>
              <li>Right to non-discrimination for exercising privacy rights</li>
            </ul>
            <p className="text-gray-600 mt-4">
              We do not sell personal information as defined by the CCPA.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. European Privacy Rights (GDPR)</h2>
            <p className="text-gray-600 mb-4">
              If you are located in the European Economic Area, you have rights under the General Data Protection
              Regulation, including:
            </p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Right to access and portability</li>
              <li>Right to rectification and erasure</li>
              <li>Right to restrict or object to processing</li>
              <li>Right to withdraw consent</li>
              <li>Right to lodge a complaint with a supervisory authority</li>
            </ul>
            <p className="text-gray-600 mt-4">
              Our legal bases for processing include consent, contract performance, legitimate interests, and
              legal obligations.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Changes to This Policy</h2>
            <p className="text-gray-600">
              We may update this Privacy Policy periodically. We will notify you of material changes by email
              or through the Service. Your continued use after changes become effective constitutes acceptance
              of the revised policy.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">14. Contact Us</h2>
            <p className="text-gray-600 mb-4">
              For questions or concerns about this Privacy Policy or our data practices, contact us at:
            </p>
            <div className="bg-gray-50 p-6 rounded-lg">
              <p className="text-gray-700 font-medium">ProperPOS Privacy Team</p>
              <p className="text-gray-600">Email: privacy@properpos.com</p>
              <p className="text-gray-600">Address: 123 Business Ave, Suite 100, San Francisco, CA 94105</p>
              <p className="text-gray-600 mt-4">
                For GDPR inquiries, you may also contact our Data Protection Officer at dpo@properpos.com.
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-400">&copy; {new Date().getFullYear()} ProperPOS. All rights reserved.</p>
          <div className="mt-4 space-x-6">
            <a href="/privacy" className="text-gray-400 hover:text-white">Privacy Policy</a>
            <a href="/terms" className="text-gray-400 hover:text-white">Terms of Service</a>
            <a href="/contact" className="text-gray-400 hover:text-white">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
