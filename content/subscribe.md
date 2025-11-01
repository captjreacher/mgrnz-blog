---
title: "Subscribe"
url: "/subscribe/"
---

<style>
.subscribe-container {
    max-width: 600px;
    margin: 0 auto;
    padding: 40px 20px;
    font-family: 'Open Sans', Arial, Helvetica, sans-serif;
}

.subscribe-header {
    text-align: center;
    margin-bottom: 40px;
}

.subscribe-header h1 {
    color: #ff4f00;
    font-size: 2.5rem;
    font-weight: 700;
    margin-bottom: 16px;
}

.subscribe-header p {
    color: #666;
    font-size: 1.1rem;
    line-height: 1.6;
}

.ml-embedded {
    margin: 0 auto;
}

/* Custom styling for MailerLite form */
.ml-form-embedContainer {
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    padding: 30px;
}

.benefits {
    margin-top: 40px;
    text-align: center;
}

.benefits h3 {
    color: #333;
    font-size: 1.5rem;
    margin-bottom: 20px;
}

.benefits ul {
    list-style: none;
    padding: 0;
    max-width: 400px;
    margin: 0 auto;
}

.benefits li {
    color: #666;
    margin-bottom: 12px;
    padding-left: 24px;
    position: relative;
}

.benefits li:before {
    content: "✓";
    color: #ff4f00;
    font-weight: bold;
    position: absolute;
    left: 0;
}
</style>

<div class="subscribe-container">
    <div class="subscribe-header">
        <h1>Subscribe to Mike's Blog</h1>
        <p>Get the latest insights on AI, technology, and business delivered straight to your inbox. Join our community of forward-thinking professionals.</p>
    </div>

    <!-- MailerLite Embedded Form -->
    <div class="ml-embedded" data-form="169453382423020905"></div>

    <div class="benefits">
        <h3>What You'll Get:</h3>
        <ul>
            <li>Weekly insights on AI and technology trends</li>
            <li>Business strategy and innovation tips</li>
            <li>Exclusive content not available on the blog</li>
            <li>Early access to new posts and announcements</li>
        </ul>
    </div>
</div>

<script>
// Initialize MailerLite form after page load
document.addEventListener('DOMContentLoaded', function() {
    // The MailerLite Universal script will automatically initialize embedded forms
    if (typeof ml !== 'undefined') {
        const embeddedForms = document.querySelectorAll('.ml-embedded[data-form]');

        if (embeddedForms.length > 0) {
            embeddedForms.forEach(container => {
                const formId = container.getAttribute('data-form');
                if (formId) {
                    ml('forms', 'load', formId);
                }
            });
        } else {
            ml('forms', 'load');
        }

        // Add custom form validation and error handling
        setTimeout(() => {
            const embeddedForm = document.querySelector('.ml-embedded form');
            if (embeddedForm) {
                embeddedForm.addEventListener('submit', function(e) {
                    const email = this.querySelector('input[type="email"]');
                    if (email && (!email.value || !email.value.includes('@'))) {
                        e.preventDefault();
                        alert('Please enter a valid email address.');
                        email.focus();
                        return false;
                    }
                });
            }
        }, 2000); // Wait for MailerLite to initialize
    } else {
        // Fallback if MailerLite Universal script fails to load
        console.warn('MailerLite Universal script not loaded. Form may not work properly.');
        
        // Show fallback message
        setTimeout(() => {
            const container = document.querySelector('.ml-embedded');
            if (container && !container.innerHTML.trim()) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 40px; background: #f8f9fa; border-radius: 8px; border: 2px dashed #dee2e6;">
                        <h3 style="color: #6c757d; margin-bottom: 16px;">Form Loading Issue</h3>
                        <p style="color: #6c757d; margin-bottom: 20px;">The subscription form is having trouble loading. You can still subscribe using the link below:</p>
                        <a href="https://dashboard.mailerlite.com/forms/1849787/169453382423020905/share" 
                           target="_blank" 
                           style="display: inline-block; background: #ff4f00; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
                           Subscribe via MailerLite →
                        </a>
                    </div>
                `;
            }
        }, 5000);
    }
});

// Function to check if subscription was successful
function checkSubscriptionStatus() {
    // Check if user recently subscribed
    const subscriptionTime = localStorage.getItem('subscription_time');
    if (subscriptionTime) {
        const timeDiff = Date.now() - parseInt(subscriptionTime);
        if (timeDiff < 300000) { // 5 minutes
            // Show success message if recently subscribed
            const container = document.querySelector('.subscribe-container');
            if (container) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="width: 80px; height: 80px; background: #28a745; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                            <span style="color: white; font-size: 40px;">✓</span>
                        </div>
                        <h1 style="color: #28a745; margin-bottom: 16px;">Already Subscribed!</h1>
                        <p style="color: #666;">You recently subscribed to our newsletter. Thank you!</p>
                        <p style="margin-top: 20px;"><a href="/" style="color: #ff4f00;">← Back to Blog</a></p>
                    </div>
                `;
            }
        }
    }
}

// Check subscription status on page load
checkSubscriptionStatus();
</script>