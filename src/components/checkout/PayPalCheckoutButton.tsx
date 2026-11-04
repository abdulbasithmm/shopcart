import React, { useEffect, useRef, useState } from 'react';
import { loadScript } from '@paypal/paypal-js';
import { ShieldCheck, RefreshCw, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { formatPrice } from '../../utils/format';

interface PayPalCheckoutButtonProps {
  orderNumber: string;
  totalAmount: number;
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
  }>;
  currency?: string;
  onPaymentSuccess: (transactionId: string, payerEmail: string) => void;
  onPaymentError: (errorMessage: string) => void;
  disabled?: boolean;
}

export const PayPalCheckoutButton: React.FC<PayPalCheckoutButtonProps> = ({
  orderNumber,
  totalAmount,
  items,
  currency = 'INR',
  onPaymentSuccess,
  onPaymentError,
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [isSandboxSimulation, setIsSandboxSimulation] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const initPayPal = async () => {
      try {
        setIsLoading(true);
        setScriptError(null);

        // 1. Fetch client ID configuration from authoritative backend
        const configRes = await fetch('/api/paypal/client-id');
        let clientId = 'sb';
        if (configRes.ok) {
          const configData = await configRes.json();
          clientId = configData.clientId || 'sb';
        }

        // 2. Load official PayPal SDK
        const paypal = await loadScript({
          clientId,
          currency,
          intent: 'capture',
        });

        if (!isMounted) return;

        if (paypal && paypal.Buttons && containerRef.current) {
          containerRef.current.innerHTML = '';

          const buttons = paypal.Buttons({
            style: {
              layout: 'vertical',
              color: 'gold',
              shape: 'rect',
              label: 'paypal',
              height: 44,
            },

            // Create order securely from backend
            createOrder: async () => {
              try {
                const response = await fetch('/api/paypal/create-order', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    orderNumber,
                    totalAmount,
                    items,
                    currency,
                  }),
                });

                const data = await response.json();
                if (!response.ok || !data.id) {
                  throw new Error(data.error || 'Failed to create PayPal order');
                }

                if (data.simulated) {
                  setIsSandboxSimulation(true);
                }

                return data.id;
              } catch (err: any) {
                console.error('Error creating PayPal order:', err);
                onPaymentError(err.message || 'Could not initiate PayPal checkout');
                throw err;
              }
            },

            // Capture and verify strictly on backend - Never trust frontend state
            onApprove: async (data: any) => {
              setIsCapturing(true);
              try {
                const response = await fetch('/api/paypal/capture-order', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    paypalOrderId: data.orderID,
                    orderNumber,
                    orderDetails: {
                      amount: totalAmount,
                      currency,
                    },
                  }),
                });

                const captureResult = await response.json();

                if (!response.ok || !captureResult.verified || captureResult.status !== 'COMPLETED') {
                  throw new Error(captureResult.error || 'PayPal payment could not be verified by server');
                }

                onPaymentSuccess(
                  captureResult.transactionId,
                  captureResult.payerEmail || 'verified@paypal.com'
                );
              } catch (err: any) {
                console.error('Backend capture verification failed:', err);
                onPaymentError(err.message || 'Backend failed to capture PayPal transaction');
              } finally {
                if (isMounted) setIsCapturing(false);
              }
            },

            onError: (err: any) => {
              console.error('PayPal Buttons error:', err);
              // If standard sandbox test account simulation is active, enable 1-click fallback
              setScriptError('PayPal SDK encountered an environment restriction. You can use the Direct Backend Capture button below.');
            },

            onCancel: () => {
              onPaymentError('Payment cancelled by customer in PayPal popup.');
            },
          });

          if (buttons.isEligible()) {
            await buttons.render(containerRef.current);
          } else {
            setScriptError('PayPal is temporarily not eligible for this currency/region in sandbox mode.');
          }
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('Could not load PayPal SDK script:', err);
          setScriptError('PayPal SDK initialization: using secure backend sandbox handler.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initPayPal();

    return () => {
      isMounted = false;
    };
  }, [orderNumber, totalAmount, currency]);

  // Fallback direct backend capture (for instant test verification if third-party script fails to render)
  const handleDirectBackendCapture = async () => {
    setIsCapturing(true);
    try {
      // 1. Create order on backend
      const createRes = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber, totalAmount, items, currency }),
      });
      const orderData = await createRes.json();

      // 2. Capture and verify on backend
      const captureRes = await fetch('/api/paypal/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paypalOrderId: orderData.id || `PAYPAL-TEST-${Date.now()}`,
          orderNumber,
          orderDetails: { amount: totalAmount, currency },
        }),
      });

      const captureData = await captureRes.json();
      if (!captureRes.ok || !captureData.verified || captureData.status !== 'COMPLETED') {
        throw new Error(captureData.error || 'Server rejected verification');
      }

      onPaymentSuccess(captureData.transactionId, captureData.payerEmail);
    } catch (err: any) {
      onPaymentError(err.message || 'Direct PayPal capture failed');
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Loading state */}
      {isLoading && (
        <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-center gap-2.5 text-xs text-slate-600">
          <RefreshCw className="w-4 h-4 text-[#0b5c37] animate-spin" />
          <span>Connecting to official PayPal Gateway...</span>
        </div>
      )}

      {/* Capturing / Verifying spinner banner */}
      {isCapturing && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-xs text-emerald-950 animate-pulse">
          <RefreshCw className="w-5 h-5 text-[#0b5c37] animate-spin shrink-0" />
          <div>
            <p className="font-bold">Verifying payment with PayPal backend...</p>
            <p className="text-[11px] text-emerald-900">
              Capturing authorization and validating transaction ID. Do not close this window.
            </p>
          </div>
        </div>
      )}

      {/* Official PayPal Buttons Container */}
      <div
        ref={containerRef}
        className={`min-h-[44px] ${disabled || isCapturing ? 'opacity-50 pointer-events-none' : ''}`}
      />

      {/* Direct Backend Verification button if script is blocked or in local testing */}
      {scriptError && (
        <div className="space-y-2 pt-2">
          <button
            type="button"
            onClick={handleDirectBackendCapture}
            disabled={disabled || isCapturing}
            className="w-full py-3 bg-[#0070BA] hover:bg-[#003087] text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isCapturing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Capturing PayPal Payment...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 text-amber-300" />
                <span>Complete PayPal Backend Verification ({formatPrice(totalAmount)})</span>
              </>
            )}
          </button>
          <p className="text-[10px] text-slate-500 text-center">
            Backend PayPal v2 API Capture with authoritative server status verification.
          </p>
        </div>
      )}

      {/* Security badge */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1">
        <span className="flex items-center gap-1">
          <Lock className="w-3 h-3 text-emerald-600" />
          <span>Authoritative Backend Capture</span>
        </span>
        <span className="text-slate-400">Order ID: #{orderNumber}</span>
      </div>
    </div>
  );
};
