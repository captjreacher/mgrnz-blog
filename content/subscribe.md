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

    <!-- MailerLite API Form -->
    <div id="subscription-form-container">
        <form id="subscription-form" class="ml-form-embedContainer">
            <div class="ml-form-formContent">
                <div class="ml-form-fieldRow">
                    <input type="text" 
                           id="first-name" 
                           name="name" 
                           placeholder="First Name" 
                           style="width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #ddd; border-radius: 4px; font-size: 16px;">
                </div>
                <div class="ml-form-fieldRow">
                    <input type="text" 
                           id="last-name" 
                           name="last_name" 
                           placeholder="Last Name" 
                           style="width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #ddd; border-radius: 4px; font-size: 16px;">
                </div>
                <div class="ml-form-fieldRow">
                    <input type="email" 
                           id="email" 
                           name="email" 
                           placeholder="Email Address" 
                           required 
                           style="width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #ddd; border-radius: 4px; font-size: 16px;">
                </div>
                <div class="ml-form-fieldRow">
                    <button type="submit" 
                            id="subscribe-btn"
                            style="width: 100%; background: #ff4f00; color: white; padding: 14px; border: none; border-radius: 4px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 16px;">
                        Subscribe to Newsletter
                    </button>
                </div>
            </div>
        </form>
        
        <div id="form-status" style="display: none; margin-top: 20px; padding: 15px; border-radius: 4px; text-align: center;"></div>
    </div>

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
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('subscription-form');
    const statusDiv = document.getElementById('form-status');
    const submitBtn = document.getElementById('subscribe-btn');
    
    // Check if user recently subscribed
    checkSubscriptionStatus();
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Get form data
        const formData = new FormData(form);
        const data = {
            email: formData.get('email'),
            name: formData.get('name'),
            last_name: formData.get('last_name')
        };
        
        // Validate email
        if (!data.email || !data.email.includes('@')) {
            showStatus('Please enter a valid email address.', 'error');
            return;
        }
        
        // Show loading state
        submitBtn.disabled = true;
        submitBtn.textContent = 'Subscribing...';
        showStatus('Processing your subscription...', 'loading');
        
        try {
            // Call Supabase function for MailerLite API
            const response = await fetch('https://your-project.supabase.co/functions/v1/mailerlite-subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (result.ok) {
                // Success
                showStatus(result.message, 'success');
                form.reset();
                
                // Store subscription time
                localStorage.setItem('subscription_time', Date.now().toString());
                
                // Redirect to thank you message after 2 seconds
                setTimeout(() => {
                    showThankYouMessage();
                }, 2000);
                
            } else {
                // Error from API
                showStatus(result.error || 'Subscription failed. Please try again.', 'error');
            }
            
        } catch (error) {
            console.error('Subscription error:', error);
            showStatus('Network error. Please check your connection and try again.', 'error');
        } finally {
            // Reset button state
            submitBtn.disabled = false;
            submitBtn.textContent = 'Subscribe to Newsletter';
        }
    });
    
    function showStatus(message, type) {
        statusDiv.style.display = 'block';
        statusDiv.className = `status-${type}`;
        statusDiv.textContent = message;
        
        // Style based on type
        if (type === 'success') {
            statusDiv.style.background = '#d4edda';
            statusDiv.style.color = '#155724';
            statusDiv.style.border = '1px solid #c3e6cb';
        } else if (type === 'error') {
            statusDiv.style.background = '#f8d7da';
            statusDiv.style.color = '#721c24';
            statusDiv.style.border = '1px solid #f5c6cb';
        } else if (type === 'loading') {
            statusDiv.style.background = '#d1ecf1';
            statusDiv.style.color = '#0c5460';
            statusDiv.style.border = '1px solid #bee5eb';
        }
    }
    
    function showThankYouMessage() {
        const container = document.querySelector('.subscribe-container');
        container.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="width: 80px; height: 80px; background: #28a745; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                    <span style="color: white; font-size: 40px;">✓</span>
                </div>
                <h1 style="color: #28a745; margin-bottom: 16px;">Welcome to the Newsletter!</h1>
                <p style="color: #666; margin-bottom: 20px;">Thank you for subscribing! You'll receive our latest insights on AI, technology, and business.</p>
                <p style="color: #666; margin-bottom: 30px;">Check your email for a confirmation message.</p>
                <a href="/" style="display: inline-block; background: #ff4f00; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">← Back to Blog</a>
            </div>
        `;
    }
    
    function checkSubscriptionStatus() {
        const subscriptionTime = localStorage.getItem('subscription_time');
        if (subscriptionTime) {
            const timeDiff = Date.now() - parseInt(subscriptionTime);
            if (timeDiff < 300000) { // 5 minutes
                showThankYouMessage();
            }
        }
    }
});
</script>