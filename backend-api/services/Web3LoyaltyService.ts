import { ethers } from 'ethers';

/**
 * 💰 WEB3 LOYALTY GAMIFICATION SERVICE
 * Objective: Bridge Traditional E-commerce with On-chain Loyalty NFTs.
 */

// Deployment Address of "Stuffy Diamond VIP" NFT Contract (Polygon/Mainnet)
const LOYALTY_NFT_CONTRACT = "0x821eed30f14d95b5465d3885f096283ff1c6a61f";
const RPC_URL = process.env.POLYGON_RPC || "https://polygon-rpc.com";

// Simplified ERC-721 Interface for balance checking
const ERC721_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)"
];

export class Web3LoyaltyService {
  
  /**
   * Signature Verification
   * Verify that the wallet address actually signed the message.
   */
  static verifySignature(walletAddress: string, signature: string, nonce: string): boolean {
    try {
      if (!walletAddress || !signature) return false;
      const message = `Stuffy_VIP_Auth_${nonce}`;
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
    } catch (e) {
      return false;
    }
  }

  /**
   * Verified NFT Ownership
   * Checks if the user's wallet owns at least 1 Stuffy VIP NFT.
   */
  static async checkVipNftOwnership(walletAddress: string): Promise<boolean> {
    try {
      if (!ethers.isAddress(walletAddress)) return false;

      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(LOYALTY_NFT_CONTRACT, ERC721_ABI, provider);
      
      const balance = await contract.balanceOf(walletAddress);
      const isOwner = Number(balance) > 0;
      
      console.log(`[Web3] 💎 User ${walletAddress} NFT Balance: ${balance}. VIP: ${isOwner}`);
      return isOwner;
    } catch (e) {
      console.warn("[Web3] NFT Service Timeout/Error. Falling back to non-VIP mode.");
      return false;
    }
  }

  /**
   * 💰 Dynamic Rule Engine - Discount Calculation
   * Apply a "Secret 20% Diamond Discount" for NFT holders.
   */
  static async applyLoyaltyDiscounts(originalPrice: number, walletAddress?: string): Promise<number> {
    if (!walletAddress) return originalPrice;

    const isVip = await this.checkVipNftOwnership(walletAddress);
    if (isVip) {
      const discount = originalPrice * 0.20; // 💎 20% Power up
      console.log(`[RuleEngine] 📉 NFT Diamond Discount Applied: -$${discount.toFixed(2)}`);
      return originalPrice - discount;
    }
    
    return originalPrice;
  }
}
