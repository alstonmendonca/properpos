'use client';

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold">Terms of Service</h1>
          <p className="mt-4 text-indigo-100">Last updated: January 15, 2025</p>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="prose prose-lg max-w-none">
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Agreement to Terms</h2>
            <p className="text-gray-600 mb-4">
              By accessing or using ProperPOS ("the Service"), you agree to be bound by these Terms of Service ("Terms").
              If you disagree with any part of the terms, you may not access the Service.
            </p>
            <p className="text-gray-600">
              These Terms apply to all visitors, users, and others who access or use the Service. By using the Service,
              you represent that you are at least 18 years of age and have the legal authority to enter into these Terms.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Description of Service</h2>
            <p className="text-gray-600 mb-4">
              ProperPOS is a cloud-based point of sale and business management platform that provides:
            </p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Point of Sale (POS) functionality for processing transactions</li>
              <li>Inventory management and tracking</li>
              <li>Customer relationship management</li>
              <li>Analytics and reporting tools</li>
              <li>Multi-location management capabilities</li>
              <li>Team and staff management</li>
              <li>Integration with third-party payment processors</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Account Registration</h2>
            <p className="text-gray-600 mb-4">
              To use ProperPOS, you must create an account. When creating an account, you agree to:
            </p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain and update your information to keep it accurate</li>
              <li>Maintain the security of your account credentials</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
            </ul>
            <p className="text-gray-600 mt-4">
              We reserve the right to suspend or terminate accounts that contain false or misleading information.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Subscription and Billing</h2>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">4.1 Subscription Plans</h3>
            <p className="text-gray-600 mb-4">
              ProperPOS offers various subscription plans with different features and pricing. The specific features
              available to you depend on your selected subscription plan.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">4.2 Free Trial</h3>
            <p className="text-gray-600 mb-4">
              We may offer a free trial period. At the end of the trial, you will be automatically enrolled in a
              paid subscription unless you cancel before the trial ends.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">4.3 Payment</h3>
            <p className="text-gray-600 mb-4">
              Subscription fees are billed in advance on a monthly or annual basis. You authorize us to charge your
              payment method for all fees due. All fees are non-refundable except as expressly stated in these Terms.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">4.4 Price Changes</h3>
            <p className="text-gray-600">
              We reserve the right to modify our pricing with 30 days advance notice. Price changes will not affect
              your current billing period.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Acceptable Use</h2>
            <p className="text-gray-600 mb-4">You agree not to use the Service to:</p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe upon the rights of others</li>
              <li>Transmit malware, viruses, or harmful code</li>
              <li>Attempt to gain unauthorized access to any systems</li>
              <li>Engage in fraudulent or deceptive practices</li>
              <li>Process transactions for illegal goods or services</li>
              <li>Interfere with the proper functioning of the Service</li>
              <li>Resell or redistribute the Service without authorization</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Data and Privacy</h2>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">6.1 Your Data</h3>
            <p className="text-gray-600 mb-4">
              You retain ownership of all data you input into ProperPOS. You grant us a limited license to use,
              store, and process your data solely to provide the Service.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">6.2 Data Security</h3>
            <p className="text-gray-600 mb-4">
              We implement industry-standard security measures to protect your data. However, no method of
              transmission over the Internet is 100% secure.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">6.3 Privacy Policy</h3>
            <p className="text-gray-600">
              Our collection and use of personal information is governed by our Privacy Policy, which is
              incorporated into these Terms by reference.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Intellectual Property</h2>
            <p className="text-gray-600 mb-4">
              The Service and its original content, features, and functionality are owned by ProperPOS and
              are protected by international copyright, trademark, patent, trade secret, and other intellectual
              property laws.
            </p>
            <p className="text-gray-600">
              You may not copy, modify, distribute, sell, or lease any part of the Service without our prior
              written consent.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Third-Party Services</h2>
            <p className="text-gray-600 mb-4">
              The Service may integrate with third-party services (payment processors, shipping providers, etc.).
              Your use of these services is subject to their respective terms and conditions. We are not
              responsible for the actions or policies of third-party services.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Termination</h2>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">9.1 By You</h3>
            <p className="text-gray-600 mb-4">
              You may cancel your subscription at any time through your account settings. Cancellation takes
              effect at the end of your current billing period.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">9.2 By Us</h3>
            <p className="text-gray-600 mb-4">
              We may terminate or suspend your account immediately, without prior notice, if you breach these
              Terms or engage in conduct that we determine is harmful to the Service or other users.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">9.3 Effect of Termination</h3>
            <p className="text-gray-600">
              Upon termination, your right to use the Service ceases immediately. You may export your data
              within 30 days of termination. After this period, we may delete your data.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Disclaimer of Warranties</h2>
            <p className="text-gray-600 mb-4 uppercase text-sm">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS
              OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
              PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p className="text-gray-600">
              We do not warrant that the Service will be uninterrupted, secure, or error-free, or that defects
              will be corrected.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Limitation of Liability</h2>
            <p className="text-gray-600 mb-4 uppercase text-sm">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, PROPERPOS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED
              DIRECTLY OR INDIRECTLY.
            </p>
            <p className="text-gray-600">
              Our total liability for any claims arising under these Terms shall not exceed the amount you paid
              us in the twelve (12) months preceding the claim.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Indemnification</h2>
            <p className="text-gray-600">
              You agree to indemnify and hold harmless ProperPOS and its officers, directors, employees, and
              agents from any claims, damages, losses, liabilities, and expenses arising from your use of the
              Service or violation of these Terms.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Governing Law</h2>
            <p className="text-gray-600">
              These Terms shall be governed by and construed in accordance with the laws of the State of Delaware,
              United States, without regard to its conflict of law provisions. Any disputes shall be resolved
              in the courts of Delaware.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">14. Changes to Terms</h2>
            <p className="text-gray-600">
              We reserve the right to modify these Terms at any time. We will notify you of material changes
              by email or through the Service. Your continued use of the Service after such modifications
              constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">15. Contact Us</h2>
            <p className="text-gray-600">
              If you have questions about these Terms, please contact us at:
            </p>
            <div className="mt-4 bg-gray-50 p-6 rounded-lg">
              <p className="text-gray-700 font-medium">ProperPOS Legal Team</p>
              <p className="text-gray-600">Email: legal@properpos.com</p>
              <p className="text-gray-600">Address: 123 Business Ave, Suite 100, San Francisco, CA 94105</p>
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
